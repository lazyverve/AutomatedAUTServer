/**
 * Created by jitender choudhary on 10/28/2016.
 * adeServerUrl : 'slc12cku.us.oracle.com;slc12ckv.us.oracle.com;slc12ckw.us.oracle.com;slc12ckx.us.oracle.com;slc12cky.us.oracle.com',
 */

module.exports = {
	dburl : 'mongodb://localhost/fusionTransactions',
	messageQueueURL : 'amqp://localhost',
	adeServerUrl : 'slc05gsa.us.oracle.com',
	historyServerUrl : 'slc05gsa.us.oracle.com',
	adeServerUser : 'jjikumar',
	adeServerPass : 'P@ssword05',
	transactionMessageQueue : 'fusionPremerge',
	fetchTrans : 'ade fetchtrans ',
	describeTrans : 'ade describetrans',
	transactionActiveLogLocation:'.\\History\\Current\\',
	transactionArchivedLogLocation:'.\\History\\Archived\\',
	sshPublicKeyLocation : 'C:\\Users\\jjikumar\\.ssh\\id_rsa'
};