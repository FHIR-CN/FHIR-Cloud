(function () {
    'use strict';

    var controllerId = 'personDetail';

    function personDetail($filter, $location, $mdBottomSheet, $mdDialog, $routeParams, $scope, $window, addressService,
                           attachmentService, common, demographicsService, fhirServers, humanNameService, identifierService,
                           organizationService, personService, contactPointService, practitionerService, communicationService,
                           careProviderService, observationService) {

        /*jshint validthis:true */
        var vm = this;

        var logError = common.logger.getLogFn(controllerId, 'error');
        var logInfo = common.logger.getLogFn(controllerId, 'info');
        var logWarning = common.logger.getLogFn(controllerId, 'warning');
        var $q = common.$q;
        var noToast = false;

        function _activate() {
            common.activateController([_getActiveServer()], controllerId).then(function () {
                _getRequestedPerson();
            });
        }

        function deletePerson(person, event) {
            function executeDelete() {
                if (person && person.resourceId && person.hashKey) {
                    personService.deleteCachedPerson(person.hashKey, person.resourceId)
                        .then(function () {
                            logInfo("Deleted person " + person.fullName);
                            $location.path('/person');
                        },
                        function (error) {
                            logError(common.unexpectedOutcome(error));
                        }
                    );
                }
            }

            var confirm = $mdDialog.confirm()
                .title('Delete ' + person.fullName + '?')
                .ariaLabel('delete person')
                .ok('Yes')
                .cancel('No')
                .targetEvent(event);
            $mdDialog.show(confirm).then(executeDelete,
                function () {
                    logInfo('You decided to keep ' + person.fullName);
                });
        }

        vm.delete = deletePerson;

        function edit(person) {
            if (person && person.hashKey) {
                $location.path('/person/' + person.hashKey);
            }
        }

        vm.edit = edit;

        function _getActiveServer() {
            fhirServers.getActiveServer()
                .then(function (server) {
                    vm.activeServer = server;
                });
        }

        function getOrganizationReference(input) {
            var deferred = $q.defer();
            organizationService.getOrganizationReference(vm.activeServer.baseUrl, input)
                .then(function (data) {
                    deferred.resolve(data);
                }, function (error) {
                    logError(common.unexpectedOutcome(error), null, noToast);
                    deferred.reject();
                });
            return deferred.promise;
        }

        vm.getOrganizationReference = getOrganizationReference;

        function goToManagingOrganization(resourceReference) {
            var id = ($filter)('idFromURL')(resourceReference.reference);
            $location.path('/organization/get/' + id);
        }

        vm.goToManagingOrganization = goToManagingOrganization;

        function _getEverything() {
            personService.getPersonEverything(vm.person.resourceId)
                .then(function (data) {
                    vm.summary = data.summary;
                    vm.history = data.history;
                    logInfo("Retrieved everything for person at " + vm.person.resourceId, null, noToast);
                }, function (error) {
                    logError(common.unexpectedOutcome(error), null, noToast);
                    _getObservations();  //TODO: fallback for those servers that haven't implemented $everything operation
                });
        }

        function _getObservations() {
            observationService.getObservations(vm.activeServer.baseUrl, null, vm.person.id)
                .then(function (data) {
                    vm.summary = data.entry;
                    logInfo("Retrieved observations for person " + vm.person.fullName, null, noToast);
                }, function (error) {
                    vm.isBusy = false;
                    logError(common.unexpectedOutcome(error), null, noToast);
                });
        }

        function _getRequestedPerson() {
            function initializeAdministrationData(data) {
                vm.person = data;
                humanNameService.init(vm.person.name);
                demographicsService.init(vm.person.gender, vm.person.maritalStatus, vm.person.communication);
                demographicsService.initBirth(vm.person.multipleBirthBoolean, vm.person.multipleBirthInteger);
                demographicsService.initDeath(vm.person.deceasedBoolean, vm.person.deceasedDateTime);
                demographicsService.setBirthDate(vm.person.birthDate);
                demographicsService.initializeKnownExtensions(vm.person.extension);
                vm.person.race = demographicsService.getRace();
                vm.person.religion = demographicsService.getReligion();
                vm.person.ethnicity = demographicsService.getEthnicity();
                vm.person.mothersMaidenName = demographicsService.getMothersMaidenName();
                vm.person.birthPlace = demographicsService.getBirthPlace();
                vm.person.birthDate = demographicsService.getBirthDate();
                attachmentService.init(vm.person.photo, "Photos");
                identifierService.init(vm.person.identifier, "multi", "person");
                addressService.init(vm.person.address, true);
                contactPointService.init(vm.person.telecom, true, true);
                careProviderService.init(vm.person.careProvider);
                if (vm.person.communication) {
                    communicationService.init(vm.person.communication, "multi");
                }
                vm.person.fullName = humanNameService.getFullName();
                if (angular.isDefined(vm.person.id)) {
                    vm.person.resourceId = (vm.activeServer.baseUrl + '/Person/' + vm.person.id);
                }
                if (vm.person.managingOrganization && vm.person.managingOrganization.reference) {
                    var reference = vm.person.managingOrganization.reference;
                    if (common.isAbsoluteUri(reference) === false) {
                        vm.person.managingOrganization.reference = vm.activeServer.baseUrl + '/' + reference;
                    }
                    if (angular.isUndefined(vm.person.managingOrganization.display)) {
                        vm.person.managingOrganization.display = reference;
                    }
                }
                if (vm.lookupKey !== "new") {
                    $window.localStorage.person = JSON.stringify(vm.person);
                }
            }

            vm.person = undefined;
            vm.lookupKey = $routeParams.hashKey;

            if (vm.lookupKey === "current") {
                if (angular.isUndefined($window.localStorage.person) || ($window.localStorage.person === null)) {
                    if (angular.isUndefined($routeParams.id)) {
                        $location.path('/person');
                    }
                } else {
                    vm.person = JSON.parse($window.localStorage.person);
                    vm.person.hashKey = "current";
                    initializeAdministrationData(vm.person);
                }
            } else if (angular.isDefined($routeParams.id)) {
                vm.isBusy = true;
                var resourceId = vm.activeServer.baseUrl + '/Person/' + $routeParams.id;
                personService.getPerson(resourceId)
                    .then(function (resource) {
                        initializeAdministrationData(resource.data);
                        if (vm.person) {
                            _getEverything(resourceId);
                        }
                    }, function (error) {
                        logError(common.unexpectedOutcome(error));
                    }).then(function () {
                        vm.isBusy = false;
                    });
            } else if (vm.lookupKey === 'new') {
                var data = personService.initializeNewPerson();
                initializeAdministrationData(data);
                vm.title = 'Add New Person';
                vm.isEditing = false;
            } else if (vm.lookupKey !== "current") {
                vm.isBusy = true;
                personService.getCachedPerson(vm.lookupKey)
                    .then(function (data) {
                        initializeAdministrationData(data);
                        if (vm.person && vm.person.resourceId) {
                            _getEverything(vm.person.resourceId);
                        }
                    }, function (error) {
                        logError(common.unexpectedOutcome(error));
                    })
                    .then(function () {
                        vm.isBusy = false;
                    });
            } else {
                logError("Unable to resolve person lookup");
            }
        }

        function save() {
            function processResult(results) {
                var resourceVersionId = results.headers.location || results.headers["content-location"];
                if (angular.isUndefined(resourceVersionId)) {
                    logWarning("Person saved, but location is unavailable. CORS not implemented correctly at remote host.");
                } else {
                    logInfo("Person saved at " + resourceVersionId);
                    vm.person.resourceVersionId = resourceVersionId;
                    vm.person.resourceId = common.setResourceId(vm.person.resourceId, resourceVersionId);
                }
                vm.person.fullName = humanNameService.getFullName();
                vm.isEditing = true;
                $window.localStorage.person = JSON.stringify(vm.person);
                vm.isBusy = false;
            }

            var person = personService.initializeNewPerson();
            if (humanNameService.getAll().length === 0) {
                logError("Person must have at least one name.");
                return;
            }
            person.name = humanNameService.mapFromViewModel();
            person.photo = attachmentService.getAll();

            person.birthDate = $filter('dateString')(demographicsService.getBirthDate());
            person.gender = demographicsService.getGender();
            person.maritalStatus = demographicsService.getMaritalStatus();
            person.multipleBirthBoolean = demographicsService.getMultipleBirth();
            person.multipleBirthInteger = demographicsService.getBirthOrder();
            person.deceasedBoolean = demographicsService.getDeceased();
            person.deceasedDateTime = demographicsService.getDeceasedDate();
            person.race = demographicsService.getRace();
            person.religion = demographicsService.getReligion();
            person.ethnicity = demographicsService.getEthnicity();
            person.mothersMaidenName = demographicsService.getMothersMaidenName();
            person.birthPlace = demographicsService.getBirthPlace();

            person.address = addressService.mapFromViewModel();
            person.telecom = contactPointService.mapFromViewModel();
            person.identifier = identifierService.getAll();
            person.managingOrganization = vm.person.managingOrganization;
            person.communication = communicationService.getAll();
            person.careProvider = careProviderService.getAll();

            person.active = vm.person.active;
            vm.isBusy = true;
            if (vm.isEditing) {
                person.id = vm.person.id;
                personService.updatePerson(vm.person.resourceId, person)
                    .then(processResult,
                    function (error) {
                        logError(common.unexpectedOutcome(error));
                        vm.isBusy = false;
                    });
            } else {
                personService.addPerson(person)
                    .then(processResult,
                    function (error) {
                        logError(common.unexpectedOutcome(error));
                        vm.isBusy = false;
                    });
            }
        }
        vm.save = save;

        function showSource($event) {
            _showRawData(vm.person, $event);
        }

        vm.showSource = showSource;

        function showAuditData($index, $event) {
            _showRawData(vm.history[$index], $event);
        }

        vm.showAuditData = showAuditData;

        function showClinicalData($index, $event) {
            _showRawData(vm.summary[$index], $event);
        }

        vm.showClinicalData = showClinicalData;

        function _showRawData(item, event) {
            $mdDialog.show({
                optionsOrPresent: {disableParentScroll: false},
                templateUrl: 'templates/rawData-dialog.html',
                controller: 'rawDataController',
                locals: {
                    data: item
                },
                targetEvent: event
            });
        }

        function canDelete() {
            return !vm.isEditing;
        }

        $scope.$on('server.changed',
            function (event, data) {
                vm.activeServer = data.activeServer;
                logInfo("Remote server changed to " + vm.activeServer.name);
            }
        );

        function canSave() {
            return !vm.isSaving;
        }

        Object.defineProperty(vm, 'canSave', {
            get: canSave
        });

        Object.defineProperty(vm, 'canDelete', {
            get: canDelete
        });

        function actions($event) {
            $mdBottomSheet.show({
                parent: angular.element(document.getElementById('content')),
                templateUrl: './templates/resourceSheet.html',
                controller: ['$mdBottomSheet', ResourceSheetController],
                controllerAs: "vm",
                bindToController: true,
                targetEvent: $event
            }).then(function (clickedItem) {
                switch (clickedItem.index) {
                    case 0:
                        $location.path('/consultation');
                        break;
                    case 1:
                        $location.path('/lab');
                        break;
                    case 2:
                        $location.path('/person');
                        break;
                    case 3:
                        $location.path('/person/edit/current');
                        break;
                    case 4:
                        $location.path('/person/edit/new');
                        break;
                    case 5:
                        $location.path('/person/detailed-search');
                        break;
                    case 6:
                        deletePerson(vm.person);
                        break;
                }
            });
            function ResourceSheetController($mdBottomSheet) {
                if (vm.isEditing) {
                    this.items = [
                        {name: 'Vitals', icon: 'vitals', index: 0},
                        {name: 'Lab', icon: 'lab', index: 1},
                        {name: 'Find another person', icon: 'quickFind', index: 2},
                        {name: 'Edit person', icon: 'edit', index: 3},
                        {name: 'Add new person', icon: 'personAdd', index: 4}
                    ];
                } else {
                    this.items = [
                        {name: 'Detailed search', icon: 'search', index: 5},
                        {name: 'Quick find', icon: 'quickFind', index: 2}
                    ];
                }
                this.title = 'Person options';
                this.performAction = function (action) {
                    $mdBottomSheet.hide(action);
                };
            }
        }

        vm.actions = actions;

        vm.activeServer = null;
        vm.dataEvents = [];
        vm.errors = [];
        vm.history = [];
        vm.isBusy = false;
        vm.summary = [];
        vm.lookupKey = undefined;
        vm.isBusy = false;
        vm.isSaving = false;
        vm.isEditing = true;
        vm.person = undefined;
        vm.practitionerSearchText = '';
        vm.selectedPractitioner = null;
        vm.title = 'Person Detail';

        _activate();
    }

    angular.module('FHIRCloud').controller(controllerId,
        ['$filter', '$location', '$mdBottomSheet', '$mdDialog', '$routeParams', '$scope', '$window',
            'addressService', 'attachmentService', 'common', 'demographicsService', 'fhirServers',
            'humanNameService', 'identifierService', 'organizationService', 'personService', 'contactPointService',
            'practitionerService', 'communicationService', 'careProviderService', 'observationService', personDetail]);
})();