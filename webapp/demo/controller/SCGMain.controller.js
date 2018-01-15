sap.ui.define([
	"ArcgisDemo/controller/BaseController",
    "sap/ui/core/util/MockServer",
    "sap/ui/model/odata/v2/ODataModel",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/odata/OperationMode",
    "sap/ui/model/Filter", "sap/ui/model/FilterOperator",
	"sap/m/MessageBox",
	"sap/m/Dialog",
	"sap/m/Input",
	"sap/m/Button"
], function (BaseController, MockServer, ODataModel, JSONModel, OperationMode, Filter, FilterOperator, MessageBox, Dialog, Input, Button) {
	"use strict";

    var sServiceUrl;
    if (window.location.hostname.match(/\.alliander\.local$/))
    {
        var href = window.location.href;
        var partial = "SCG/Meetopstelling";
        sServiceUrl = href.substr(0, href.indexOf(partial) + partial.length) + "/MEETOPSTELLINGEN.xsodata/GDSS_WEBSERVICE?$format=json";
    }
    else
        sServiceUrl = "http://my.test.service.com/";

	return BaseController.extend("ArcgisDemo.controller.SCGMain", {
		
        onInit: function () {
            if (!sServiceUrl.match(/json/)) {
                this.oMockServer = new MockServer({
                    rootUri: sServiceUrl
                });

                MockServer.config({ autoRespondAfter: 200 });

                var sMockDataPath = jQuery.sap.getModulePath("ArcgisDemo");
                this.oMockServer.simulate(sMockDataPath + "/metadata.xml", {
                    sMockdataBaseUrl: sMockDataPath,
                    bGenerateMissingMockData: true
                });

                this.oMockServer.start();
            }

            var oView = this.getView();
            this.oBusyIndicator = this.getTable().getNoData();
            oView.setModel(new ODataModel(sServiceUrl));

            this.initBindingEventHandler();

            var oUiData = {
                operationModes: [],
                selectedOperationMode: OperationMode.Server
            };
            for (var mode in OperationMode) {
                oUiData.operationModes.push({ name: OperationMode[mode] });
            }
            oView.setModel(new JSONModel(oUiData), "ui");

            var oPredefFilter = {
                filters: [
                    { text: "Geen filter", key: -1 },
                    { text: "Risicovolle Tracés", key: 200109 },
                    { text: "Selectie", key: 200110 },
                    { text: "Gepland CWI", key: 200126 },
                    { text: "Gepland", key: 200129 },
                    { text: "Plaatsing > MD", key: 200138 },
                    { text: "Geplaatst", key: 200151 },
                    { text: "Verwijderen > MD", key: 200155 },
                    { text: "Historie", key: 200166 }
                ],
                selectedFilter: -1
            };
            oView.setModel(new JSONModel(oPredefFilter), "filter");

            var oTable = this.getTable();
            var lastSelIndex = -1;
            var oController = this;
            oTable.attachEvent("rowSelectionChange", function (oEvent) {
                var oRowContext = oEvent.getParameter("rowContext")
                var scgPlaatsingId = null;
                if (oEvent.getSource().getSelectedIndex() != -1) {
                    scgPlaatsingId = oRowContext.oModel.getProperty("SCG_PLAATSING_ID", oRowContext);
                }
                oController._selectInMap(scgPlaatsingId);
            });
        },

        _selectInMap: function (scgPlaatsingId) {

            var oArcgisMap = this.getMap().arcgismap;
            var oController = this;

            require([
                "esri/layers/FeatureLayer",
                "esri/tasks/query", "esri/geometry/Extent", "esri/geometry/geometryEngine", "dojo/_base/array"], function (FeatureLayer, Query, Extent, GeometryEngine, array) {


                    var scgLayer = oController.scgLayer;
                    scgLayer.clearSelection();
                    if (scgPlaatsingId == null)
                        return;
                    var query = new Query();
                    query.where = "SCG_PLAATSING_ID=" + scgPlaatsingId;
                    scgLayer.selectFeatures(query, FeatureLayer.SELECTION_NEW, function (features) {
                        var geoms = array.map(features, function (feature) {
                            return feature.geometry;
                        });
                        var stateExtent = GeometryEngine.union(geoms).getExtent();
                        stateExtent = stateExtent.expand(2.0);
                        oArcgisMap.setExtent(stateExtent);
                    });
                });
        },

        onExit: function () {
            this.oBusyIndicator.destroy();
            this.oBusyIndicator = null;

            this.oMockServer.destroy();
            this.oMockServer = null;
            MockServer.config({ autoRespondAfter: 0 });
        },

        formatDimensions: function (sWidth, sHeight, sDepth, sUnit) {
            if (sWidth && sHeight && sDepth && sUnit) {
                return sWidth + "x" + sHeight + "x" + sDepth + " " + (sUnit.toLowerCase());
            }
            return null;
        },

        getTable: function () {
            return this.getView().byId("table");
        },

        getMap: function () {
            return this.getView().byId("map");
        },

        onModelRefresh: function () {
            this.getTable().getBinding().refresh(true);
        },

        onOperationModeChange: function (oEvent) {
            var _key = oEvent.getParameter("key");
            var _filter = (_key != -1) ? [new Filter({
                path: "SCG_PLAATSING_ID",
                operator: FilterOperator.EQ,
                value1: _key
            })] : [];
            this.getTable().bindRows({
                path: "/Meetopstellingen",
                filters: _filter,
                parameters: { operationMode: oEvent.getParameter("key") }
            });
            this.initBindingEventHandler();
            this.onModelRefresh();
        },

        initBindingEventHandler: function () {
            var oBusyIndicator = this.oBusyIndicator;
            var oTable = this.getTable();
            var oBinding = oTable.getBinding("rows");

            oBinding.attachDataRequested(function () {
                oTable.setNoData(oBusyIndicator);
            });
            oBinding.attachDataReceived(function () {
                oTable.setNoData(null); //Use default again ("No Data" in case no data is available)
            });
        },

        showInfo: function (oEvent) {
            try {
                jQuery.sap.require("sap.ui.table.sample.TableExampleUtils");
                sap.ui.table.sample.TableExampleUtils.showInfo(jQuery.sap.getModulePath("sap.ui.table.sample.OData", "/info.json"), oEvent.getSource());
            } catch (e) {
                // nothing
            }
        },

        onMapReady: function (oEvent) {
            // The Arcgis map object can be found in the event parameters
            var oArcgisMap = oEvent.getParameter("arcgismap");

            var scgLayerUrl = "http://st5214.alliander.local/arcgis/rest/services/SCG/Plaatsingen/FeatureServer/0";
            var oController = this;
            require(["esri/layers/FeatureLayer", "esri/symbols/SimpleLineSymbol", "esri/symbols/SimpleFillSymbol", "esri/symbols/SimpleMarkerSymbol", "esri/Color"], function (FeatureLayer, SimpleLineSymbol, SimpleFillSymbol, SimpleMarkerSymbol, Color) {
                var scgLayer = new FeatureLayer(scgLayerUrl, {
                    mode: FeatureLayer.MODE_SELECTION,
                    outFields: ["ObjectID", "SCG_PLAATSING_ID", "VELD_NAN"]
                });
                //scgLayer.setSelectionSymbol(new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID, new Color([0, 255, 255])));
                // new SimpleFillSymbol(SimpleFillSymbol.STYLE_SOLID, new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID, new Color([0, 255, 255])) , new Color([0, 255, 255]))
                var sms = new SimpleMarkerSymbol(SimpleMarkerSymbol.STYLE_SQUARE, 40,
                    new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID,
                        new Color([0, 255, 255]), 2.5),
                    new Color([0, 255, 0, 0]));
                scgLayer.setSelectionSymbol(sms);


                // Add a layer to the basemap
                oController.scgLayer = scgLayer;
                oArcgisMap.addLayer(scgLayer);

            });
        },
		
		addLayerWeather1: function() {
			// Get the map object from the custom control
			var oArcgisMap = this.getMap().arcgismap;
			
			var weatherLayer = "https://services.arcgisonline.nl/arcgis/rest/services/Weer/Actuele_weersinformatie/MapServer";
			
			require(["esri/layers/FeatureLayer"], function(FeatureLayer) {
				
				// Add a layer to the basemap
				var oFeatureLayer = new FeatureLayer(weatherLayer + "/0");
				oFeatureLayer.on("click", function(oEvent) {
					getAllObjectsAtClick(oEvent.graphic._layer, oEvent.mapPoint).then(function(oResult) {
						if (oResult && oResult.featureSet && oResult.featureSet.features && oResult.featureSet.features.length > 0) {
							var sTemp = oResult.featureSet.features[0].attributes.temperatuurGC;
							MessageBox.alert("'t is koud hier: maar " + sTemp + " graden!");
						}
					});
				});
				oArcgisMap.addLayer(oFeatureLayer);
				
			});
		},
		
		addLayerWeather2: function() {
			// Get the map object from the custom control
			var oArcgisMap = this.getView().byId("map").arcgismap;
			
			var weatherLayer = "https://services.arcgisonline.nl/arcgis/rest/services/Weer/Actuele_weersinformatie/MapServer";
			
			require([
				"esri/layers/FeatureLayer",
				"esri/tasks/query",
				"esri/tasks/QueryTask",
				"esri/geometry/Extent",
				"esri/SpatialReference"
				], function(FeatureLayer, Query, QueryTask, Extent, SpatialReference) {
					
					// Add a layer to the basemap
					var oFeatureLayer = new FeatureLayer(weatherLayer + "/1");
						
					oFeatureLayer.on("click", function(oEvent) {
						var oQuery = new Query();
						var oQueryTask = new QueryTask(oFeatureLayer.url);
						var oExtent = new Extent(oEvent.mapPoint.x - 10000, oEvent.mapPoint.y - 10000, oEvent.mapPoint.x + 10000, oEvent.mapPoint.y + 10000, new SpatialReference({wkid: 28992}));
						oQuery.geometry = oExtent;
						oQuery.outFields = ["*"];
						oQueryTask.on("complete", function (oResult){
							console.log(oResult);
							if (oResult && oResult.featureSet && oResult.featureSet.features && oResult.featureSet.features.length > 0) {
								var sWindSpeedBF = oResult.featureSet.features[0].attributes.windsnelheidBF;
								MessageBox.alert("Windsnelheid is " + sWindSpeedBF + " beaufort.");
							}
						});
						oQueryTask.execute(oQuery);
					});
					
					oArcgisMap.addLayer(oFeatureLayer);
				
			});
		},
		
		findLocation: function() {
			// Get the map object from the custom control
			var oArcgisMap = this.getView().byId("map").arcgismap;
			
			var dialog = new Dialog({
				title: 'Enter an address or location',
				type: 'Message',
				content: [
					new Input('input', {
						width: '100%',
						placeholder: 'Location?'
					})
				],
				beginButton: new Button({
					text: 'Submit',
					press: function () {
						var sText = sap.ui.getCore().byId('input').getValue();
						$.getJSON("https://geodata.nationaalgeoregister.nl/locatieserver/v3/free?q=" + sText)
						.then(function(oResult) {
							if (oResult.response && oResult.response.docs && oResult.response.docs.length > 0) {
								var sLocRD = oResult.response.docs[0].centroide_rd;
								var rdX = Number(sLocRD.substring("POINT(".length, sLocRD.indexOf(" ")));
								var rdY = Number(sLocRD.substring(sLocRD.indexOf(" ") + 1, sLocRD.indexOf(")")));
								
								require([
									"esri/symbols/PictureMarkerSymbol",
									"esri/symbols/Font",
									"esri/Color",
									"esri/layers/GraphicsLayer",
									"esri/graphic",
									"esri/geometry/Point",
									"esri/SpatialReference",
									"esri/symbols/TextSymbol"
								], function(PictureMarkerSymbol, Font, Color, GraphicsLayer, Graphic, Point, SpatialReference, TextSymbol) {
									var graphic = new Graphic({
										geometry: new Point(rdX, rdY, new SpatialReference({
											wkid: 28992
										}))
									});
									graphic.symbol = new TextSymbol({
										text: "", // sap-icon://map
										font: new Font({
											family: "SAP-icons",
											size: 16
										}),
										color: new Color("#346187")
									});
									var graphicsLayer = null;
									if (!oArcgisMap.getLayer("location")) {
										graphicsLayer = new GraphicsLayer({
											id: "location"
										});
									} else {
										graphicsLayer = oArcgisMap.getLayer("location");
									}
									graphicsLayer.clear();
									graphicsLayer.add(graphic);
									oArcgisMap.addLayer(graphicsLayer);
								});
								
							}
							console.log(oResult);
						});
						dialog.close();
					}
				}),
				endButton: new Button({
					text: 'Cancel',
					press: function () {
						dialog.close();
					}
				}),
				afterClose: function() {
					dialog.destroy();
				}
			});
			dialog.open();
		}
		
	});

	function getAllObjectsAtClick (oFeatureLayer, oMapPoint) {
		return new Promise(function (resolve) {
			require([
				"esri/tasks/query",
				"esri/tasks/QueryTask",
				"esri/geometry/Extent",
				"esri/SpatialReference"
			],
			function (Query, QueryTask, Extent, SpatialReference) {
				var oQuery = new Query();
				var oQueryTask = new QueryTask(oFeatureLayer.url);
				oQuery.geometry = new Extent(oMapPoint.x - 10000, oMapPoint.y - 10000, oMapPoint.x + 10000, oMapPoint.y + 10000, new SpatialReference({
					wkid: 28992
				}));
				oQuery.outFields = ["*"];
				oQueryTask.on("complete", function (oRes){
					resolve(oRes);
				});
				oQueryTask.execute(oQuery);
			});
		});
	}

});
