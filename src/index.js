(function (formBuilder) {
    /**
     *  This directive is responsible for adding drag and drop functionality and sending the
     *  builderDropzone` the required object in order to identify the dropped item. 
     */
    formBuilder.directive('builderToolboxFieldType', ['$compile', function ($compile) {
        return {
            restrict: 'A',
            scope: {
                name: '@',
            },
            controller: function ($scope) {
                // check if it was defined.  If not - set a default
                $scope.item = $scope.item || { name: $scope.name };
            },
            compile: function (tElement, attrs, transclude) {
                tElement.removeAttr('builder-toolbox-field-type');
                tElement.attr('dnd-draggable', 'item');
                tElement.attr('dnd-effect-allowed', 'move');
                tElement.attr('dnd-type', 'name');
                return {
                    pre: function preLink(scope, iElement, iAttrs, controller) { },
                    post: function postLink(scope, iElement, iAttrs, controller) {
                        $compile(iElement)(scope);
                    }
                };
            },

        };
    }]);

    formBuilder.directive('builderDropzone', ['$compile', 'builderConfig', function ($compile, builderConfig) {
        return {
            restrict: 'AE',
            scope: {
                formBuilderFields: '=?',
                formViewerFields: '=?',
                shouldUpdate: '&?'
            },
            template: '<builder-dropzone-field ng-repeat="formBuilderField in formBuilderFields" form-builder-field="formBuilderField" form-viewer-field="formViewerFields[$index]" dnd-draggable="formBuilderField" dnd-type="formBuilderField.name" dnd-moved="onItemRemoved($index)" dnd-effect-allowed="move" />',
            controller: function ($scope, $element, $attrs) {
                // check if it was defined.  If not - set a default
                $scope.formBuilderFields = $scope.formBuilderFields || [];
                //init formViewerFields to match formBuilderFields
                $scope.formViewerFields = new Array($scope.formBuilderFields.length).fill({});
                //  this adds the form field to `formViewerFields` when the field is dropped to the dropzone 
                //  the added form field is intitialized by undefined 
                //  and the `builder-dropzone-field` is resposible for updating this value
                //  runs a callback to determine whether an item can be added to the drop zone. If it returns true then the item will be added
                $scope.onItemDropped = function (event, index, item, external, type) {
                    let canAddItem = true;
                    if ($attrs["shouldUpdate"] && typeof $scope.shouldUpdate == "function")
                        canAddItem = $scope.shouldUpdate({ children: $scope.formBuilderFields, nextComponent: item });
                    if (canAddItem) {
                        //when a new item is added to formBuilderFields a placholder  object is created 
                        $scope.formViewerFields.splice(index, 0, {});
                        return item;
                    } else {
                        // stop Drop event propagation to higher drop zones
                        event.stopImmediatePropagation();
                        //stop drop event 
                        return false;
                    }
                };

                /** 
                 *this function is invoked when the `builder-dropzone-field` is destroyed
                 *the `builder-dropzone-field` is mainly destoryed when the item (field) is removed from the `formBuilderFields`
                 *`formViewerFields` needs to be updated by removing the corresponding field from it
                 */
                $scope.onItemRemoved = function (index) {
                    $scope.formBuilderFields.splice(index, 1);
                    $scope.formViewerFields.splice(index, 1);
                }

            },
            compile: function (tElement, attrs, transclude) {
                tElement.removeAttr('builder-dropzone');
                tElement.attr('dnd-list', 'formBuilderFields');
                tElement.attr('dnd-drop', 'onItemDropped(event, index, item, external, type)');

                return {
                    pre: function preLink(scope, iElement, iAttrs, controller) {
                    },
                    post: function postLink(scope, iElement, iAttrs, controller) {
                        $compile(iElement)(scope);
                    }
                };
            },
        };
    }]);

    /**
     * This directive is responsible for rendering the droped field template  and
     *  add drag and drop functionality to it
     */
    formBuilder.directive('builderDropzoneField', ['$compile', 'builderConfig', '$q', '$templateCache', '$http', '$controller', function ($compile, builderConfig, $q, $templateCache, $http, $controller) {
        let check = apiCheck();

        function getFieldTemplate(component) {
            return getTemplate(component.template || component.templateUrl, !component.template);
        }

        //Takes a function injecting controller scope into it then invoke it. Simulating runtime directives
        function invokeController(controller, scope) {
            check.throw([check.func, check.object], arguments, { prefix: 'faild to invoke field controller this may happen if you are not passing a function', suffix: "check setType function" });
            $controller(controller, { $scope: scope })
        }

        //Takes a function injecting link function arguments into it then invoke it. Simulating runtime directives
        function invokeLink(fieldConfig, context, args) {
            let linkFunc = fieldConfig.link;
            return function () {
                if (!linkFunc)
                    return;
                else if (typeof linkFunc === "function")
                    linkFunc.apply(context, args);
                else
                    throw new Error('Link property must be a function check setType');
            }
        }


        function freezObjectProperty(object, propertyName) {
            Object.defineProperty(object, propertyName, {
                value: object[propertyName],
                writable: false,
                enumerable: true,
                configurable: true
            });
        }

        //resolvers html template and return a promise
        function getTemplate(template, isUrl) {
            let templatePromise = $q.when(template);
            if (!isUrl)
                return templatePromise;
            else {
                const httpOptions = { cache: $templateCache };
                return templatePromise.then(function (url) {
                    return $http.get(url, httpOptions);
                }).then(function (response) {
                    return response.data;
                })
                    .catch(function (error) {
                        throw new Error('can not load template url ' + template + ' ' + error);
                    });
            }
        }

        //search dom tree for a element (transclude) then replaces that element with a new template then return a new html
        function doTransclusion(wrapper, template) {
            let superWrapper = angular.element('<a></a>');
            superWrapper.append(wrapper);
            let transcludeEl = superWrapper.find('transclude');
            if (!transcludeEl.length)
                console.warn("can not find transclude tag check your wrapper template " + wrapper);
            transcludeEl.replaceWith(template);
            return superWrapper.html();
        }

        //Takes a set of html templates then wrap them over the original html template then return a promise
        function transcludeInWrappers(fieldConfig) {
            const wrappers = fieldConfig.wrapper;
            return function (template) {
                if (!wrappers || wrappers.length == 0)
                    return $q.when(template); // if no wrappers are provided just return the orginal template
                else if (Array.isArray(wrappers)) {
                    //try to resolve html templates will return array of promises
                    let templatesPromises = wrappers.map(function (wrapper) {
                        return getTemplate(wrapper, true);
                    });
                    return $q.all(templatesPromises).then(function (wrappersTemplates) {
                        wrappersTemplates.reverse();
                        let totalWrapper = wrappersTemplates.shift();
                        wrappersTemplates.forEach(function (wrapper) {
                            totalWrapper = doTransclusion(totalWrapper, wrapper);
                        });
                        return doTransclusion(totalWrapper, template);
                    });
                }
                else {
                    throw new Error("wrapper must be of type array check setType")
                }
            }
        }

        return {
            restrict: 'AE',
            scope: {
                formBuilderField: '=',
                formViewerField: '=',
            },
            link: function (scope, elem, attr) {
                //The field name should be immutable to disallow extrnal code from modifying it but currently this behaviour is not implmented
                //freezObjectProperty(scope.item, "name");
                let fieldConfig = builderConfig.getType(scope.formBuilderField.name);
                let args = arguments;
                let that = this;
                //link template with scope and invoke custome link function
                getFieldTemplate(fieldConfig)
                    .then(transcludeInWrappers(fieldConfig))
                    .then(function (templateString) {
                        let compieldHtml = $compile(templateString)(scope);
                        elem.append(compieldHtml);
                    }).then(invokeLink(fieldConfig, that, args))
                    .catch(function (error) {
                        throw new Error('Faild to set template for this field ' + error + " " + JSON.stringify(fieldConfig));
                    });
            },
            controller: function ($scope) {
                let fieldConfig = builderConfig.getType($scope.formBuilderField.name);

                $scope.transformFormField = function (formBuilderField, formViewerField) {
                    let transformedComponent = fieldConfig.transformFormField(formBuilderField, formViewerField);

                    let transformedFormBuilderField = transformedComponent && transformedComponent.formBuilderField ? transformedComponent.formBuilderField : {};
                    Object.assign($scope.formBuilderField, transformedFormBuilderField);

                    let transformedFormViewerField = transformedComponent && transformedComponent.formViewerField ? transformedComponent.formViewerField : {};
                    Object.assign($scope.formViewerField, transformedFormViewerField);
                }
                if (fieldConfig.controller)
                    invokeController(fieldConfig.controller, $scope);
                
                $scope.transformFormField($scope.formBuilderField, $scope.formViewerField);
            },
        };

    }]);

    formBuilder.directive('builderFieldConfig', ['$compile', function ($compile) {
        return {
            restrict: 'A',
            scope: {
                name: '@',
            },
            controller: function ($scope) {
                // check if it was defined.  If not - set a default
                $scope.item = $scope.item || { name: $scope.name };
            },
            link: function (scope, elem, attr) {

            }

        };
    }]);

    //register and get application components.
    formBuilder.factory('builderConfig', function () {
        const typeMap = {}; // hashmap of components 
        let check = apiCheck();

        function checkType(component) {
            if (angular.isUndefined(component.name))
                throw new Error('field name must be defined check setType of ' + JSON.stringify(component));
            else if (angular.isUndefined(component.template) && angular.isUndefined(component.templateUrl))
                throw new Error('field template or templateUrl must be defined check setType of ' + JSON.stringify(component));
            else if (typeof component.transformFormField != "function")
                throw new Error("field must have a transformFormField function check setType of " + JSON.stringify(component));
        }

        return {
            /*
            Takes directive definition object with extra properties and saves it to a hashmap. 
            The object properties will be validated then registered, 
            keys in the hashmap are lower case. If key exists its value will be overwritten.
             */
            setType: function (component) {
                check.throw([check.object], arguments, { prefix: 'faild to set new type this may happen if you are not passing an object', suffix: "check setType function" });
                checkType(component);
                if (typeMap[component.name.toLowerCase()])
                    console.warn(component.name + " is registered before it will be overwritten");
                typeMap[component.name.toLowerCase()] = component;
            },
            /*
            Takes component name and gets it from hashmap. name is case insensitive .
             */
            getType: function (name) {
                check.throw([check.string], arguments, { prefix: 'faild to get type this may happen if you are not passing an string', suffix: "check getType function" });
                let lowerCaseName = name.toLowerCase();
                if (typeMap[lowerCaseName])
                    return typeMap[lowerCaseName];
                else {
                    throw new Error('The field ' + name + ' is not registered');
                }
            }
        };
    });

})(angular.module('formBuilder', ['dndLists']));
