/**
 * Created by jitender choudhary on 10/28/2016.
 */

angular.module('MainCtrl', []).controller('MainController', function ($rootScope, $scope, $http) {

    $scope.transaction = {
        name: '',
        email: '',
        updateBug: 'N',
        runJunits: 'Y',
        applyFPR: 'N',
        allowDBOverride: 'Y',
        errorMsg:
        {
            transactionError: '',
            DBError: ''
        },
        description:
        {
            "baseLabel": '{"name":"","value":""}',
            "bugNum": { "name": "", "value": "" },
            "transDesc": { "name": "", "value": "" }
        },
        family:
        {
            availableOptions: [
                { id: '1', name: 'Select Family', productList: [] },
                {
                    id: '2', name: 'Procurement', productList: [
                        { id: '1', name: 'PO' },
                        { id: '2', name: 'PON' },
                        { id: '3', name: 'POQ' },
                        { id: '4', name: 'POR' },
                        { id: '5', name: 'POZ' },
                    ], product: { id: '1', name: 'PO' }
                }
            ],
            selectedOption: { id: '1', name: 'Select Family', product: 'Select Product' }
        },
        submissionMethod:'UI'
    };
    $scope.errorMsg = "";
    $scope.projectList = [];
    $scope.allProjectList = [];
    $scope.junitSelectedList = [];

    $scope.submitTransaction = function () {
        var trans = $scope.transaction;
        $scope.transaction = {
            name: '',
            email: '',
            updateBug: 'N',
            runJunits: 'Y',
            applyFPR: 'N',
            allowDBOverride: 'Y',
            errorMsg: {
                transactionError: '',
                DBError: ''
            },
            description: {
                "baseLabel": '{"name":"","value":""}',
                "bugNum": { "name": "", "value": "" },
                "transDesc": { "name": "", "value": "" }
            },
            family:
            {
                availableOptions: [
                    { id: '1', name: 'Select Family', productList: [] },
                    {
                        id: '2', name: 'Procurement', productList: [
                            { id: '1', name: 'PO' },
                            { id: '2', name: 'PON' },
                            { id: '3', name: 'POQ' },
                            { id: '4', name: 'POR' },
                            { id: '5', name: 'POZ' },
                        ], product: { id: '1', name: 'PO' }
                    }
                ],
                selectedOption: { id: '1', name: 'Select Family', product: 'Select Product' }
            },
            submissionMethod:'UI'
        };
        $scope.errorMsg = "";
        if ($scope.junitSelectedList.length !== 0) {
            trans.junitSelectedList = $scope.junitSelectedList;
            $scope.junitSelectedList = [];
        }


        try {
            if (trans.family.selectedOption.name != 'Procurement') {
                trans.allowDBOverride = 'N';
            }
        }
        catch (err) {
            console.log('Error while getting family name from transaction');
        }

        $http.post('/api/submit', trans).success(function (response) {
            console.log('Client : Recieved Data from server', response);
        }).error(function (err) {
            console.log('Client : Recieved Data from server', err);
            if (variable !== null) {
                $scope.errorMsg = err.error;
            }

        });
    };


    $('#transactionname').click(function () {
        var value = $('#transactionname').val();
        if (value) {
            $scope.transactionSubmitform.transaction.$setDirty();
        } else {
            $scope.transactionSubmitform.$setPristine();
        }
    });

    $scope.updateProjectList = function () {
        var series = { val: 'Procurement' };
        console.log('updating list of procects for series :', series);
        $http.post('/api/updateProjectList', series).success(function (response) {
            console.log('Client : ProjectList Updated Successfully', response);
        }).error(function (err) {
            console.log('Client : Failed To update projectlist', err);
        });
    };


    $scope.getAllProjectList = function () {
        $http.get('/api/getProjectList', $scope.transaction).success(function (response) {
            var arrayLength = response.length;
            for (var k = 0; k < arrayLength; k++) {
                for (var i in response[k].list) {
                    if (response[k].list[i])
                        $scope.allProjectList.push({ "familyName": response[k].name, id: response[k].list[i], "label": response[k].list[i].substring(response[k].list[i].lastIndexOf('/') + 1) });
                }
            }
        }).error(function (err) {
            console.log('Client : failed to get projectList from the server', err);
        });
    };

    $scope.getAllProjectList();

    $scope.$watch('transaction.family.selectedOption', function updateProjectList() {
        var arrayLength = $scope.allProjectList.length;
        $scope.projectList = [];
        for (var i = 0; i < arrayLength; i++) {
            if ($scope.allProjectList[i].familyName == $scope.transaction.family.selectedOption.name) {
                $scope.projectList.push({ id: $scope.allProjectList[i].id, "label": $scope.allProjectList[i].label });
            }
        }
        console.log("Updated ProjectList for the product Family ", $scope.transaction.family.selectedOption.name);
    }
    );

    $scope.projectListConfigParams = {
        enableSearch: true,
        scrollableHeight: '500px',
        scrollable: true,
        smartButtonMaxItems: 3,
        smartButtonTextConverter: function (itemText, originalItem) { return itemText; }
    };
    $scope.projectListDisplayText = { buttonDefaultText: 'Select Project to run Junits' }
});