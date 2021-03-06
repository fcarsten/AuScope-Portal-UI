import { config } from '../../environments/config';
import { ref } from '../../environments/ref';
import { QuerierModalComponent } from '../modalwindow/querier/querier.modal.component';
import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import { BsModalService, BsModalRef } from 'ngx-bootstrap/modal';
import { ViewerConfiguration } from 'angular-cesium';
import { CsCSWService, CsMapService, CSWRecordModel, GMLParserService, LayerModel, ManageStateService, QueryWFSService, QueryWMSService, SimpleXMLService, UtilitiesService } from '@auscope/portal-core-ui';
import { MapMode2D, ScreenSpaceEventHandler, ScreenSpaceEventType, Rectangle, ImagerySplitDirection } from 'cesium';

@Component({
  selector: 'app-cs-map',
  template: `
    <div #mapElement id="map" class="h-100 w-100">
      <ac-map>
          <rectangles-editor></rectangles-editor>
          <app-cs-map-zoom></app-cs-map-zoom>
          <app-cs-map-split (toggleEvent)="toggleShowMapSplit()"></app-cs-map-split>
          <app-cs-clipboard class="btn-group float-right mb-3"></app-cs-clipboard>
          <div #mapSlider id="mapSlider" *ngIf="getSplitMapShown()">
            <div class="slider-grabber"></div>
          </div>
      </ac-map>
    </div>
    `,
    providers: [ViewerConfiguration], // Don't forget to Provide it 
    styleUrls: ['./csmap.component.css']
  // The "#" (template reference variable) matters to access the map element with the ViewChild decorator!
})


export class CsMapComponent implements AfterViewInit {
  // This is necessary to access the html element to set the map target (after view init)!
  @ViewChild('mapElement', { static: true }) mapElement: ElementRef;

  @ViewChild('mapSlider', { static: false }) mapSlider: ElementRef;

  name = 'Angular';
  cesiumLoaded = true;
  viewer: any;

  sliderMoveActive: boolean = false;

  public static AUSTRALIA = Rectangle.fromDegrees(114.591, -45.837, 148.97, -5.73);

  private bsModalRef: BsModalRef;

  constructor(private csMapService: CsMapService, private modalService: BsModalService,
    private queryWFSService: QueryWFSService, private queryWMSService: QueryWMSService, private gmlParserService: GMLParserService,
    private manageStateService: ManageStateService, private viewerConf: ViewerConfiguration) {
    // FIXME this.csMapService.getClickedLayerListBS().subscribe(mapClickInfo => {
    //  this.handleLayerClick(mapClickInfo);
    //});

    // viewerOptions will be passed the Cesium.Viewer constuctor
    viewerConf.viewerOptions = {
      selectionIndicator: false,
      timeline: false,
      infoBox: false,
      fullscreenButton: false,
      baseLayerPicker: true,
      imageryProviderViewModels: this.csMapService.createBaseMapLayers(),
      terrainProviderViewModels: [],
      animation: false,
      shouldAnimate: false,
      homeButton: false,
      geocoder: false,
      navigationHelpButton: false,
      navigationInstructionsInitiallyVisible: false,
      mapMode2D: MapMode2D.ROTATE,
    };
    // Will be called on viewer initialistion
    viewerConf.viewerModifier = (viewer: any) => {
      // Remove default double click zoom behaviour
      viewer.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

      // Look at Australia
      viewer.camera.setView({
        destination: CsMapComponent.AUSTRALIA
      });
      this.viewer = viewer;

      // This reduces the blockiness of the text fonts and other graphics
      this.viewer.resolutionScale = window.devicePixelRatio;
    };

  }

  getViewer() {
    return this.viewer;
  }

  ngAfterViewInit() {

    this.csMapService.init();

    // TODO: Add a cesium widget to display coordinates of mouse 

    // TODO: Add a cesium widget to zoom in/out on map
  
    // TODO: Add a cesium widget to display map scale
    
    // TODO: Add a cesium geocoder widget

    // This code is used to display the map state stored in a permanent link
    const state = UtilitiesService.getUrlParameterByName('state');
    if (state) {
      const me = this;
      this.manageStateService.getUnCompressedString(state, function(result) {
        const layerStateObj = JSON.parse(result);
        const modalDisplayed = {value: false}

          for (const layerKey in layerStateObj) {
            if (layerKey === 'map') {
              continue;
            }
            if (layerStateObj[layerKey].raw) {
              me.csMapService.getAddLayerSubject().subscribe((layer: LayerModel) => {
                setTimeout(() => {
                  if (layer.id === layerKey) {
                    const mapLayer = {
                      onlineResource: layerStateObj[layerKey].onlineResource,
                      layer: layer
                    }
                    me.displayModal(modalDisplayed, null);
                    me.setModal(layerStateObj[layerKey].raw, mapLayer, me.bsModalRef, layerStateObj[layerKey].gmlid);
                  }
                }, 0);
              })
            }
          }
      });
      // VT: End permanent link
    }
  }


  /**
   * Handles the map click event
   * @param mapClickInfo object with map click information
   */
  private handleLayerClick(mapClickInfo) {
    if (UtilitiesService.isEmpty(mapClickInfo)) {
      return;
    }
    // Process lists of features
    const modalDisplayed = {value: false}
    let featureCount = 0;
    for (const feature of mapClickInfo.clickedFeatureList) {
      if (feature.id_ && feature.id_.indexOf('geocoder') === 0) {
        continue;
      }
      // NB: This is just testing that the popup window does display
      this.displayModal(modalDisplayed, mapClickInfo.clickCoord);

      // VT: if it is a csw renderer layer, handling of the click is slightly different
      if (config.cswrenderer.includes(feature.layer.id) || CsCSWService.cswDiscoveryRendered.includes(feature.layer.id)) {
        this.setModalHTML(this.parseCSWtoHTML(feature.cswRecord), feature.cswRecord.name, feature, this.bsModalRef);
      } else if (ref.customQuerierHandler[feature.layer.id]) {
          const handler = new ref.customQuerierHandler[feature.layer.id](feature);
          this.setModalHTML(handler.getHTML(feature), handler.getKey(feature), feature, this.bsModalRef);
      } else {       // VT: in a normal feature, yes we want to getfeatureinfo
        featureCount++;
        if (featureCount < 10) {// VT: if more than 10 feature, ignore the rest
         try {
            this.queryWFSService.getFeatureInfo(feature.onlineResource, feature.id_).subscribe(result => {
              this.setModal(result, feature, this.bsModalRef);
            }, err => {
              this.bsModalRef.content.downloading = false;
              });
          } catch (error) {
           this.setModalHTML('<p> ' + error + '</p>',
            'Error Retrieving Data', feature, this.bsModalRef);
          }
        } else {
          this.setModalHTML('<p>Too many features to list, zoom in the map to get a more precise location</p>',
            '...', feature, this.bsModalRef);
          break;
        }
      }
    }

    // VT: process list of layers clicked
    for (const maplayer of mapClickInfo.clickedLayerList) {
      this.displayModal(modalDisplayed, mapClickInfo.clickCoord);

      if (config.cswrenderer.includes(maplayer.layer.id)) {
        this.setModalHTML(this.parseCSWtoHTML(maplayer.cswRecord), maplayer.cswRecord.name, maplayer, this.bsModalRef);
      } else {
        if (maplayer.onlineResource) {
          this.bsModalRef.content.downloading = true;
          this.queryWMSService.getFeatureInfo(maplayer.onlineResource, maplayer.sldBody, mapClickInfo.pixel, mapClickInfo.clickCoord).subscribe(result => {
            this.setModal(result, maplayer, this.bsModalRef);
          },
            err => {
              this.bsModalRef.content.downloading = false;
            });
        }
      }

    }
  }


  /**
   * Convert CSW record to HTML for display
   * @param cswRecord CSW record to be converted
   * @returns HTML string
   */
  private parseCSWtoHTML(cswRecord: CSWRecordModel): string {
    let html =  '<div class="row"><div class="col-md-3">Source</div><div class="col-md-9"><a href="' + cswRecord.recordInfoUrl + '">Full Metadata and download</a></div></div><hr>';
    html +=  '<div class="row"><div class="col-md-3">Title</div><div class="col-md-9">' + cswRecord.name + '</div></div><hr>';
    html +=  '<div class="row"><div class="col-md-3">Abstract</div><div class="col-md-8"><div class="row" style="height: 100px;overflow-y: scroll;margin-left:0">' +
       cswRecord.description + '</div></div></div><hr>';
    html +=  '<div class="row"><div class="col-md-3">Keywords</div><div class="col-md-9">' + cswRecord.descriptiveKeywords + '</div></div><hr>';
    html +=  '<div class="row"><div class="col-md-3">Organization</div><div class="col-md-9">' + cswRecord.contactOrg + '</div></div><hr>';

    html +=  '<div class="row"><div class="col-md-3">Resource link</div><div class="col-md-9">';
    for (const onlineResource of cswRecord.onlineResources) {
      html += '<p><a href="' + onlineResource.url + '">' + (onlineResource.name ? onlineResource.name : 'Web resource link') + '</a></p>';
    }
    html += '</div></div>';

    return html;
  }


  /**
   * Display the querier modal on map click
   * @param modalDisplayed modal dialog to be displayed
   * @param clickCoord map click coordinates
   */
  private displayModal(modalDisplayed, clickCoord) {
    if (modalDisplayed.value === false) {
      this.bsModalRef = this.modalService.show(QuerierModalComponent, {class: 'modal-lg'});
      modalDisplayed.value = true;
      this.bsModalRef.content.downloading = true;
      if (clickCoord) {
        const vector = this.csMapService.drawDot(clickCoord);
        this.modalService.onHide.subscribe(reason => {
          this.csMapService.removeVector(vector);
        })
      }
    }
  }


  /**
   * Hide the querier modal
   */
  private hideModal() {
    if (this.bsModalRef) {
      this.bsModalRef.hide();
    }
  }


  /**
   * Parse JSON response. This is used for responses from GSKY servers
   * but could be adapted for other servers at a later date
   * @param result response string to be processed
   * @param feature map feature object
   * @returns list of objects; for each object keys are: 'key' 
   */
  private parseJSONResponse(result: string, feature: any): any[] {
    const treeCollections = [];
    try {
      // Parse result and check type
      const jsonObj = JSON.parse(result);
      const type = Object.prototype.toString.call(jsonObj);
      // Make sure it is an object or array and not 'null' or 'true' or 'false'
      if (type === '[object Object]' || type === '[object Array]') {
        if (jsonObj.type && jsonObj.type === 'FeatureCollection' && jsonObj.features) {
          for (const jsonFeature of jsonObj.features) {
            if (jsonFeature.properties) {
              // Remove GSKY error about 'Requested width/height is too large, max width:512, height:512'
              // NB: This can be removed once NCI improve the GSKY server so that there is a bigger limit on
              // WIDTH/HEIGHT parameter for the OGC WMS GetFeatureInfo request
              if (jsonFeature.properties.error) {
                delete jsonFeature.properties.error;
              }
              // Create a JSON-based feature
              treeCollections.push({
                key: feature.layer.name,
                layer: feature.layer,
                onlineResource: feature.onlineResource,
                value: jsonFeature.properties,
                format: 'JSON'
              });
            }
          }
        }
      }
    } catch (err) {
        return [];
    }
    return treeCollections;
  }


  /**
   * Set the modal dialog with the layers that have been clicked on
   * @param result response string
   * @param feature map feature object
   * @param bsModalRef modal dialog reference
   * @param gmlid: a optional filter to only display the gmlId specified
   */
  private setModal(result: string, feature: any, bsModalRef: BsModalRef, gmlid?: string) {
    let treeCollections = [];

    // GSKY only returns JSON, even if you ask for XML & GML
    if (UtilitiesService.isGSKY(feature.onlineResource)) {
      treeCollections = this.parseJSONResponse(result, feature);
    } else {
      treeCollections = SimpleXMLService.parseTreeCollection(this.gmlParserService.getRootNode(result), feature);
    }
    let featureCount = 0;
    for (const treeCollection of treeCollections) {
      if (gmlid && gmlid !== treeCollection.key) {
        continue;
      }
      featureCount++;
      if (featureCount >= 10) {
        this.setModalHTML('<p>Too many features to list, zoom in the map to get a more precise location</p>',
          '...', feature, this.bsModalRef);
        break;

      }
      treeCollection.raw = result;
      bsModalRef.content.docs.push(treeCollection);
      if (bsModalRef.content.uniqueLayerNames.indexOf(feature.layer.name) === -1) {
        bsModalRef.content.uniqueLayerNames.push(feature.layer.name)
      }
    }

    this.bsModalRef.content.downloading = false
  }


  /**
   * Set the modal dialog with an HTML message
   * @param html HTML response string
   * @param key label for the message
   * @param feature map feature object
   * @param bsModalRef modal dialog reference
   */
  private setModalHTML(html: string, key: any, feature: any, bsModalRef: BsModalRef) {
      bsModalRef.content.htmls.push({
        key: key,
        layer: feature.layer,
        value: html
      });
      if (bsModalRef.content.uniqueLayerNames.indexOf(feature.layer.name) === -1) {
        bsModalRef.content.uniqueLayerNames.push(feature.layer.name)
      }
     this.bsModalRef.content.downloading = false;
  }

  /**
   * Updates the imagerySplitPosition when the slider is moved
   * @param movement mouse event
   */
  private moveSlider = (movement) => {
    if (!this.sliderMoveActive) {
      return;
    }
    // New position is slider position + the relative mouse offset    
    let newSliderPosition = this.mapSlider.nativeElement.offsetLeft + movement.endPosition.x;
    // Make sure we haven't gone too far left (slider < 0) or right (slider > map width - slider width)
    if (newSliderPosition < 0) {
      newSliderPosition = 0;
    } else if (newSliderPosition > (this.mapElement.nativeElement.offsetWidth - this.mapSlider.nativeElement.offsetWidth)) {
      newSliderPosition = this.mapElement.nativeElement.offsetWidth - this.mapSlider.nativeElement.offsetWidth;
    }
    const splitPosition = newSliderPosition / this.mapElement.nativeElement.offsetWidth;
    this.mapSlider.nativeElement.style.left = 100.0 * splitPosition + "%";
    this.viewer.scene.imagerySplitPosition = splitPosition;
  }

  /**
   * Split map toggled on/off
   * If on, sets imagerySplitPosition and adds handlers
   * If off, resets all active layer split directions to NONE
   */
  public toggleShowMapSplit() {
    this.csMapService.setSplitMapShown(!this.csMapService.getSplitMapShown());
    if (this.csMapService.getSplitMapShown()) {
        setTimeout(() => {
          this.viewer.scene.imagerySplitPosition = this.mapSlider.nativeElement.offsetLeft / this.mapElement.nativeElement.offsetWidth;
          let handler = new ScreenSpaceEventHandler(this.mapSlider.nativeElement);
          handler.setInputAction(() => {
            this.sliderMoveActive = true;
          }, ScreenSpaceEventType.LEFT_DOWN);
          handler.setInputAction(() => {
            this.sliderMoveActive = true;
          }, ScreenSpaceEventType.PINCH_START);
          handler.setInputAction(this.moveSlider, ScreenSpaceEventType.MOUSE_MOVE);
          handler.setInputAction(this.moveSlider, ScreenSpaceEventType.PINCH_MOVE);
          handler.setInputAction(() => {
            this.sliderMoveActive = false;
          }, ScreenSpaceEventType.LEFT_UP);
          handler.setInputAction(() => {
            this.sliderMoveActive = false;
          }, ScreenSpaceEventType.PINCH_END);
        }, 10);

    } else {
      for (let l = 0; l < this.viewer.imageryLayers.length; l++) {
        this.viewer.imageryLayers.get(l).splitDirection = ImagerySplitDirection.NONE;
      }
    }
  }
  
  /**
   * Get whether the map split is shown
   */
  public getSplitMapShown(): boolean {
    return this.csMapService.getSplitMapShown();
  }

}
