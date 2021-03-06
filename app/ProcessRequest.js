/**
 * Created by jitender choudhary on 10/28/2016.
 */

"use strict";
var amqp = require('amqplib/callback_api');
var fuseConfig = require('../config/configuration');
var processTimeout;
var mongoose = require('mongoose');
var Databases = require('../app/models/DBData');
var logger = require('./LoggingConfig');
mongoose.Promise = global.Promise;
mongoose.connect(fuseConfig.dburl);
var db = mongoose.connection;
db.once('open', function () {
    logger.info('Server : Process Request is connected to the database ');
});

var serveRequest = function (transaction) {
    logger.info('Posting request to process premerge for transaction :', transaction.name);
    amqp.connect(fuseConfig.messageQueueURL, function (err, conn) {
        conn.createChannel(function (err, ch) {
            var q = 'fusionPremerge';
            ch.assertQueue(q, { durable: true });
            ch.sendToQueue(q, new Buffer(JSON.stringify(transaction)), { persistent: true });
            logger.info("Message Posted to queue ", transaction);
        });
    });
};

var checkParticularDBAvaliablityandProcess = function (transaction) {
    var query = { "connectionString": transaction.dbString };
    transaction.DBServerUsed = transaction.dbString;
    logger.info('checkParticularDBAvaliablityandProcess() request received');
    Databases.find(query).lean().exec(function (err, dbData) {
        if (err) {
            logger.error('error occured while fetching Currently avaliable Databases : ', err);
        }
        else if (dbData.length > 0) {
            var db = dbData[0];
            if (db.currentStatus !== 'USED') {
                Databases.findOneAndUpdate({ 'alias': db.alias }, { "currentStatus": 'USED' }, { upsert: false }, function (err, doc) {
                    if (err) {
                        logger.error('Unable to update the row for the DB String  ' + transaction.dbString, err);
                    } else {
                        logger.info('Locked Database for the Junits : ', transaction.dbString);
                        clearTimeout(processTimeout);
                        serveRequest(transaction);
                    }
                });
            }
        }
        else {
            clearTimeout(processTimeout);
            serveRequest(transaction);
        }
    });
};

var checkAnyDBAvaliablityandProcess = function (transaction) {
    var query = { "currentStatus": "UNUSED" };
    logger.info('checkAnyDBAvaliablityandProcess() request received');
    Databases.find(query, function (err, dbData) {
        logger.info('call back from db received  ');
        if (err) { logger.error('error occured while fetching Currently avaliable Databases : ', err); }
        else if (dbData.length > 0) {
            var db = dbData[0];
            logger.info('updating status for the database : ', db.connectionString);
            Databases.findOneAndUpdate({ 'alias': db.alias }, { "currentStatus": 'USED' }, { upsert: false }, function (err, doc) {
                if (err) {
                    logger.error('Unable to update the row for the DB String  ' + transaction.dbString, err);
                } else {
                    logger.info('Locked Database for the Junints : ', transaction.dbString);
                    clearTimeout(processTimeout);
                    transaction.DBServerUsed = db.connectionString;
                    serveRequest(transaction);
                }
            });
        }
    });
};

var processSubmitRequest = function (transactionString) {
    var transaction = JSON.parse(transactionString);
    if(!transaction.dbString){
        transaction.dbString = 'fusion/fusion@slc09xht.us.oracle.com:1559/jikumar';
    }
    var dbSplitIndex = transaction.dbString.indexOf('@') + 1;
    var dbDomain = transaction.dbString.substring(dbSplitIndex, dbSplitIndex + 3);
    var adeDomain = transaction.adeServerUsed.substring(0, 3);
    if (dbDomain !== adeDomain) {
        transaction.remark = 'DB and ADE Server are in Different Zone';
    }
    logger.info('transaction.runJunits : ', transaction.runJunits);
    logger.info('transaction.allowDBOverride : ', transaction.allowDBOverride);

        transaction.DBServerUsed = transaction.dbString;
        serveRequest(transaction);
    
};

processSubmitRequest(process.argv[2]);