/*****************************************************************************
 * Open MCT, Copyright (c) 2014-2017, United States Government
 * as represented by the Administrator of the National Aeronautics and Space
 * Administration. All rights reserved.
 *
 * Open MCT is licensed under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * http://www.apache.org/licenses/LICENSE-2.0.
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 *
 * Open MCT includes source code licensed under additional open source
 * licenses. See the Open Source Licenses file (LICENSES.md) included with
 * this source code distribution or the Licensing information page available
 * at runtime from the About dialog for additional information.
 *****************************************************************************/

/**
 * This bundle implements views of image telemetry.
 * @namespace platform/features/imagery
 */

define(
    [
        'zepto',
        'lodash'
    ],
    function ($, _) {

        /**
         * Controller for the "Imagery" view of a domain object which
         * provides image telemetry.
         * @constructor
         * @memberof platform/features/imagery
         */

        function ImageryController($scope, $window, element, openmct) {
            this.$scope = $scope;
            this.$window = $window;
            this.openmct = openmct;
            this.date = "";
            this.time = "";
            this.zone = "";
            this.imageUrl = "";
            this.requestCount = 0;
            this.scrollable = $(element[0]);
            this.autoScroll = openmct.time.clock() ? true : false;

            this.$scope.imageHistory = [];
            this.$scope.filters = {
                brightness: 100,
                contrast: 100
            };

            this.subscribe = this.subscribe.bind(this);
            this.stopListening = this.stopListening.bind(this);
            this.updateValues = this.updateValues.bind(this);
            this.updateHistory = this.updateHistory.bind(this);
            this.onBoundsChange = this.onBoundsChange.bind(this);
            this.onScroll = this.onScroll.bind(this);

            this.subscribe(this.$scope.domainObject);

            this.$scope.$on('$destroy', this.stopListening);
            this.openmct.time.on('bounds', this.onBoundsChange);
            this.scrollable.on('scroll', this.onScroll);
        }

        ImageryController.prototype.subscribe = function (domainObject) {
            this.date = "";
            this.imageUrl = "";
            this.openmct.objects.get(domainObject.getId())
                .then(function (object) {
                    this.domainObject = object;
                    var metadata = this.openmct
                        .telemetry
                        .getMetadata(this.domainObject);
                    var timeKey = this.openmct.time.timeSystem().key;
                    this.timeFormat = this.openmct
                        .telemetry
                        .getValueFormatter(metadata.value(timeKey));
                    this.imageFormat = this.openmct
                        .telemetry
                        .getValueFormatter(metadata.valuesForHints(['image'])[0]);
                    this.unsubscribe = this.openmct.telemetry
                        .subscribe(this.domainObject, function (datum) {
                            this.updateHistory(datum);
                            this.updateValues(datum);
                        }.bind(this));
                    this.requestLad(false);
                    this.requestHistory(this.openmct.time.bounds());
                }.bind(this));
        };

        ImageryController.prototype.requestHistory = function (bounds) {
            this.requestCount++;
            this.$scope.imageHistory = [];
            var requestId = this.requestCount;
            this.openmct.telemetry
                .request(this.domainObject, bounds)
                    .then(function (values) {
                        if (this.requestCount > requestId) {
                            return Promise.resolve('Stale request');
                        }
                        values.forEach(function (datum) {
                            this.updateHistory(datum);
                        }, this);
                        this.requestLad(true);
                    }.bind(this));
        };

        /**
         * Makes a request for the most recent datum in the
         * telelmetry store. Optional addToHistory argument
         * determines whether the requested telemetry should
         * be added to history or only used to update the current
         * image url and timestamp.
         * @private
         * @param {boolean} [addToHistory] if true, adds to history
         */
        ImageryController.prototype.requestLad = function (addToHistory) {
            this.openmct.telemetry
                .request(this.domainObject, {
                    strategy: 'latest',
                    size: 1
                })
                .then(function (values) {
                    this.updateValues(values[0]);
                    if (addToHistory !== false) {
                        this.updateHistory(values[0]);
                    }
                }.bind(this));
        };

        ImageryController.prototype.stopListening = function () {
            this.openmct.time.off('bounds', this.onBoundsChange);
            this.scrollable.off('scroll', this.onScroll);
            if (this.unsubscribe) {
                this.unsubscribe();
                delete this.unsubscribe;
            }
        };

        /**
         * Responds to bound change event be requesting new
         * historical data if the bound change was manual.
         * @private
         * @param {object} [newBounds] new bounds object
         * @param {boolean} [tick] true when change is automatic
         */
        ImageryController.prototype.onBoundsChange = function (newBounds, tick) {
            if (this.domainObject && !tick) {
                this.requestHistory(newBounds);
            }
        };

        /**
         * Updates displayable values to match those of the most
         * recently recieved datum.
         * @param {object} [datum] the datum
         * @private
         */
        ImageryController.prototype.updateValues = function (datum) {
            if (this.isPaused) {
                this.nextDatum = datum;
                return;
            }

            this.time = this.timeFormat.format(datum);
            this.imageUrl = this.imageFormat.format(datum);

        };

        /**
         * Appends given imagery datum to running history.
         * @private
         * @param {object} [datum] target telemetry datum
         * @returns {boolean} falsy when a duplicate datum is given
         */
        ImageryController.prototype.updateHistory = function (datum) {
            if (this.$scope.imageHistory.length === 0 ||
                !_.isEqual(this.$scope.imageHistory.slice(-1)[0], datum)) {

                var index = _.sortedIndex(this.$scope.imageHistory, datum, 'utc');
                this.$scope.imageHistory.splice(index, 0, datum);
                return true;
            }

            return false;
        };

        ImageryController.prototype.onScroll = function (event) {
            this.$window.requestAnimationFrame(function () {
                if (this.scrollable[0].scrollLeft <
                    (this.scrollable[0].scrollWidth - this.scrollable[0].clientWidth) - 20) {
                    this.autoScroll = false;
                } else {
                    this.autoScroll = true;
                }
            }.bind(this));
        };

        ImageryController.prototype.scrollToRight = function () {
            if (this.autoScroll) {
                this.scrollable[0].scrollLeft = this.scrollable[0].scrollWidth;
            }
        };

        /**
         * Get the time portion (hours, minutes, seconds) of the
         * timestamp associated with the incoming image telemetry
         * if no parameter is given, or of a provided datum.
         * @param {object} [datum] target telemetry datum
         * @returns {string} the time
         */
        ImageryController.prototype.getTime = function (datum) {
            return datum ?
                this.timeFormat.format(datum) :
                this.time;
        };

        /**
         * Get the URL of the most recent image telemetry if no
         * parameter is given, or of a provided datum.
         * @param {object} [datum] target telemetry datum
         * @returns {string} URL for telemetry image
         */
        ImageryController.prototype.getImageUrl = function (datum) {
            return datum ?
                this.imageFormat.format(datum) :
                this.imageUrl;
        };

        /**
         * Getter-setter for paused state of the view (true means
         * paused, false means not.)
         * @param {boolean} [state] the state to set
         * @returns {boolean} the current state
         */
        ImageryController.prototype.paused = function (state) {
                if (arguments.length > 0 && state !== this.isPaused) {
                    this.isPaused = state;
                    if (this.nextDatum) {
                        this.updateValues(this.nextDatum);
                        delete this.nextDatum;
                    }
                }
                return this.isPaused;
            };

        return ImageryController;
    }
);
