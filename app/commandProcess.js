/**
 * Created by jitender choudhary on 10/28/2016.
 */
"use strict";
var amqp = require('amqplib/callback_api');
var SSH = require('simple-ssh');
var fuseConfig = require('../config/configuration');
var fs = require('fs');
var TransData = require('../app/models/TransData');
var Databases = require('../app/models/DBData');
var mongoose = require('mongoose');
var logger = require('./LoggingConfig');
var CC = 'jitender.k.kumar@oracle.com';
var exec = require('child_process').exec;
mongoose.Promise = global.Promise;
mongoose.connect(fuseConfig.dburl);
var db = mongoose.connection;


db.once('open', function () {
	logger.info('Server : Child process is connected to the database ');
});

var releaseDBLock = function (dbServer) {
	logger.info('about to release lock for database  :', dbServer);
	var query = { "connectionString": dbServer, "currentStatus": "USED" };
	Databases.findOneAndUpdate(query, { "currentStatus": "UNUSED" }, { upsert: false }, function (err, doc) {
		if (err) {
			logger.error('Unable to release lock on db :' + dbServer, err);
		} else {
			logger.info('Released lock on db  :', dbServer);
		}
	});
};


var getTransactionOverallStatus = function (permergeResultMainOutputFile) {
	var transactionStatus = 'Successful';
	//for AUT
	return transactionStatus
	// if (fs.existsSync(permergeResultMainOutputFile)) {
	// 	logger.info('AUT final output file exist at location  :', permergeResultMainOutputFile);
	// 	var premergeOutputArray = fs.readFileSync(permergeResultMainOutputFile).toString().split("\n");
	// 	for (var i in premergeOutputArray) {
	// 		if (premergeOutputArray[i].includes("Overall Validation Status")) {
	// 			var words = premergeOutputArray[i].split(" ");
	// 			transactionStatus = words[words.length - 2].trim();
	// 			logger.info('Transactinal final status ' + transactionStatus);
	// 			break;
	// 		}
	// 	}
	// } else {
	// 	logger.info('AUT final output file does not exist at location  :', permergeResultMainOutputFile);
	// }
	// return transactionStatus;
};

var updateTransactionStatus = function (transaction, status, logFile, permergeResultMainOutputFile) {
	var query;
	if (status === "Running") {
		query = { "name": transaction.name, "currentStatus": "Queued" };
		TransData.findOneAndUpdate(query, { "currentStatus": status, "starttime": Date.now(), "logFileName": logFile, "DBServerUsed": transaction.DBServerUsed, "adeServerUsed": transaction.adeServerUsed }, { upsert: false }, function (err, doc) {
			if (err) {
				logger.error('Unable to update the row for the transaction ' + transaction.name, err);
			} else {
				logger.info('update row for transaction , will start AUT process on the label :', transaction.name);
			}
		});
	} else if (status === "Archived") {
		query = { "name": transaction.name, "currentStatus": "Running" };
		var detailedLogLocation = transaction.transactionDetailedLocation;
		logger.info('AUT  detailedLogLocation for the transaction ' + transaction.name + ' : ', detailedLogLocation);
		var transStatus = getTransactionOverallStatus(permergeResultMainOutputFile);
		TransData.findOneAndUpdate(query, { "currentStatus": status, "endtime": Date.now(), "logFileName": logFile, "premergeOutput": transStatus, "transactionDetailedLocation": detailedLogLocation }, { upsert: false }, function (err, doc) {
			if (err) {
				logger.error('Unable to update the row for the transaction ' + transaction.name, err);
			}
			else {
				logger.info('update row for transaction , completed AUT process on the label :', transaction.name);
			}
			if (transaction.runJunits === 'Y') {
				releaseDBLock(transaction.DBServerUsed);
				logger.info('Released lock for DB' + transaction.DBServerUsed);
			}
		});
	}
};

var updateTransactionErrorStatus = function (transaction, logFile) {
	logFile = fuseConfig.transactionArchivedLogLocation + logFile;
	var query = { "name": transaction.name, "currentStatus": "Queued" };
	TransData.findOneAndUpdate(query, { "currentStatus": "Archived", "starttime": Date.now(), "endtime": Date.now(), "premergeOutput": transaction.description.error, "logFileName": logFile }, { upsert: false }, function (err, doc) {
		if (err) {
			logger.error('Unable to update the row for the transaction ' + transaction.name, err);
		} else {
			logger.info('update row for transaction , no more processing required for the transaction :', transaction.name);
		}
	});
};



var updateErroredTransation = function (trans, logStream, logFile) {
	var errorMessage = "Problem Occured while running Validation script on transaction : " + trans.name + " , Error :" + trans.description.error;
	var emailSubject = getEmailSubject(trans);
	var errorMailCommand = 'echo ' + '\"' + errorMessage + '\"' + ' | mutt -s ' + emailSubject + ' ' + trans.email;
	logStream.write("Problem Occured while running Validation script on transaction : " + trans.name + " Error :" + trans.description.error);
	logStream.end();
	var source = fs.createReadStream(fuseConfig.transactionActiveLogLocation + logFile);
	var dest = fs.createWriteStream(fuseConfig.transactionArchivedLogLocation + logFile);
	source.pipe(dest);
	source.on('end', function () {
		logger.info('transaction logs moved to Archived');
		fs.unlink(fuseConfig.transactionActiveLogLocation + logFile);
		dest.end();
	});
	source.on('error', function (err) {
		logger.error('failed to move transaction logs to Archived', err);
	});
	updateTransactionErrorStatus(trans, logFile);
	new SSH({
		host: trans.adeServerUsed,
		user: fuseConfig.adeServerUser,
		pass: fuseConfig.adeServerPass
	}).exec(errorMailCommand, {
		out: function (stdout) {
			logger.info(stdout);
			return false;
		},
		err: function (stderr) {
			logger.info(stderr);
			return false;
		}
	}).start();
};

var getEmailBody = function(trans){
	var validationRelativePathServer = trans.transactionDetailedLocation.substr(trans.transactionDetailedLocation.lastIndexOf('/'));
	var validationSummaryFile = validationRelativePathServer.substr(0,validationRelativePathServer.length-2);
	var emailBody ='"'+'AUT validation completed for your request ' + trans.name + 
					'.\\nYou can verify the summary of the validation at ' + trans.transactionDetailedLocation+validationSummaryFile+'test-report.html'+
					'.\\nYou can verify the detailed result of the validation at ' + trans.transactionDetailedLocation+
					'"';
	return emailBody;
}

var getEmailSubject = function(trans){
	var mailSubject = '"FusionPrcCloud-AUT Validation Complete for your request '+ trans.name +'"';
	return mailSubject;
}

var processTransaction = function (transData) {
	var trans = JSON.parse(transData);
	var date = new Date();
	var logFile = trans.name + '_' + date.getTime();
	var logStream = fs.createWriteStream(fuseConfig.transactionActiveLogLocation + logFile, { 'flags': 'a' });
	if (trans.description.error) {
		updateErroredTransation(trans, logStream, logFile);
		return;
	}
	var transName = ("jjikumar" + trans.name.substring(trans.name.indexOf('_'))) + '_' + date.getTime();
	logger.info('transaction data recived in the child process ', trans);
	var series = trans.name;
	var viewName = fuseConfig.adeServerUser + '_cloud_' + date.getTime();
	var premergeOutLoc = '/scratch/views/' + viewName + '/fusionapps/prc/';
	updateTransactionStatus(trans, 'Running', fuseConfig.transactionActiveLogLocation + logFile, "");
	var str = trans.dbString;
    var userName = str.substring(0, str.indexOf('/'));
    var userPass = str.substring(userName.length+1,str.indexOf('@'))
    var hostName = str.substring(str.indexOf('@')+1, str.indexOf(':'));
    var hostPort = str.substring(str.indexOf(':')+1, str.lastIndexOf('/'));
    var hostSID =  str.substring(str.lastIndexOf('/')+1);
	logger.info('Database Details Parsed : ',str,userName,userPass,hostName,hostName,hostPort,hostSID);
	
	var projectList = '' ;
	if (trans.junitSelectedList) {
		for (var i in trans.junitSelectedList) {	
			var project  =  trans.junitSelectedList[i].id ;
			project = project.substring(project.lastIndexOf('/')+1);
			projectList += project+',';
		}
	}

	logger.info('projectList : ',projectList);

	var createViewCommand = 'ade createview ' + viewName + ' -label ' + series ;
	var useViewCommand = 'ade useview -silent ' + viewName + ' -exec ';
	var finScriptParams = useViewCommand + ' \" cd prc && ant -f build-po.xml -Dtest.lrg=true test test-report -Dlrg=prc_po_lrg -Dtest.project=\''+projectList+'\' -Ddb.host='+hostName+' -Ddb.port='+hostPort
									+ ' -Ddb.sid='+hostSID + ' -Ddb.user='+userName + ' -Ddb.pass='+userPass;


	var endDelimeter = ' \"';
	var exeCommand = finScriptParams + endDelimeter;
	var detailedTransactionOutputLocation = 'http://slc12ckt.us.oracle.com:81/' + transName + '_1'
	trans.transactionDetailedLocation = detailedTransactionOutputLocation;
	var emailBody = getEmailBody(trans);
	var emailSubject = getEmailSubject(trans);
	var sendmailCommand = 'echo ' + emailBody + ' | mutt -s ' + emailSubject + ' -b ' + CC + ' ' + trans.email;
	var premergeResultLocalLocation = __dirname + '\\..\\History\\Archived\\' + transName + '_1\\';
	var preMergeResCopyCommandTest = 'scp -i ' + fuseConfig.sshPublicKeyLocation + ' -r ' + fuseConfig.adeServerUser + '@' + trans.adeServerUsed + ':' + premergeOutLoc + 'Test* ' + premergeResultLocalLocation;
	var preMergeResCopyCommandtest = 'scp -i ' + fuseConfig.sshPublicKeyLocation + ' -r ' + fuseConfig.adeServerUser + '@' + trans.adeServerUsed + ':' + premergeOutLoc + 'test* ' + premergeResultLocalLocation;
	
	var permergeResultMainOutputFile = premergeResultLocalLocation + transName + '.txt';

	logger.info('******************************************************************************************************************************************************');
	logger.info('Email Body : ', emailBody);
	logger.info('******************************************************************************************************************************************************');
	logger.info('command to copy data : ', preMergeResCopyCommandTest);
	logger.info('command to copy data : ', preMergeResCopyCommandtest);
	logger.info('******************************************************************************************************************************************************');
	logger.info('send mail command', sendmailCommand);
	logger.info('******************************************************************************************************************************************************');
	logger.info('command to be executed', exeCommand);
	logger.info('******************************************************************************************************************************************************');
	new SSH({
		host: trans.adeServerUsed,
		user: fuseConfig.adeServerUser,
		pass: fuseConfig.adeServerPass
	}).exec(createViewCommand, {
		out: function (stdout) {
			logStream.write(stdout);
			logger.info(stdout);
		},
		err: function (stderr) {
			logger.info(stderr);
			return false;
		}
	}).exec(exeCommand, {
		out: function (stdout) {
			logStream.write(stdout);
			logger.info(stdout);
		},
		err: function (stderr) {
			logger.info(stderr);
			return false;
		}
	}).exec('echo', {
		out: function (stdout) {
			var copyFiles = exec(preMergeResCopyCommandTest, function (error, stdout, stderr) {
				if (error) {
					logger.error('Error occured while coping premerge result files : ', error);
				}
			});
			logStream.write('AUT Process completed');
			logger.info('AUT Process completed');
			logStream.end();
			var source = fs.createReadStream(fuseConfig.transactionActiveLogLocation + logFile);
			var dest = fs.createWriteStream(fuseConfig.transactionArchivedLogLocation + logFile);
			source.pipe(dest);
			source.on('end', function () {
				logger.info('AUT request logs moved to Archived');
				fs.unlink(fuseConfig.transactionActiveLogLocation + logFile);
				dest.end();
			});
			source.on('error', function (err) {
				logger.error('failed to move AUT request logs to Archived', err);
			});
		},
		err: function (stderr) {
			logger.info(stderr);
			return false;
		}
	}).exec('echo', {
		out: function (stdout) {
			var copyFiles = exec(preMergeResCopyCommandtest, function (error, stdout, stderr) {
				if (error) {
					logger.error('Error occured while coping premerge result files : ', error);
				}
			});
			logStream.write('AUT Process completed');
			logger.info('AUT Process completed');
			logStream.end();
			var source = fs.createReadStream(fuseConfig.transactionActiveLogLocation + logFile);
			var dest = fs.createWriteStream(fuseConfig.transactionArchivedLogLocation + logFile);
			source.pipe(dest);
			source.on('end', function () {
				logger.info('AUT request logs moved to Archived');
				fs.unlink(fuseConfig.transactionActiveLogLocation + logFile);
				dest.end();
			});
			source.on('error', function (err) {
				logger.error('failed to move AUT request logs to Archived', err);
			});
		},
		err: function (stderr) {
			logger.info(stderr);
			return false;
		}
	}).exec("echo", {
		out: function (stdout) {
			logger.info("permergeResultMainOutputFile : " + permergeResultMainOutputFile);
			setTimeout(function () {
				updateTransactionStatus(trans, 'Archived', fuseConfig.transactionArchivedLogLocation + logFile, permergeResultMainOutputFile);
			}, 60000);
		},
		err: function (stderr) {
			logger.info(stderr);
			return false;
		}
	}).exec(sendmailCommand, {
		out: function (stdout) {
			logger.info(stdout);
		},
		err: function (stderr) {
			logger.info(stderr);
			return false;
		}
	}).exec('yes n | ade destroyview -force ' + viewName, {
		out: function (stdout) {
			logger.info(stdout);
		},
		err: function (stderr) {
			logger.info(stderr);
			return false;
		}
	}).start();
};
processTransaction(process.argv[2]);