import * as React from 'react';
import { CSSProperties } from 'react';
import { Component, ComponentContext } from 'platform/api/components';
import { trigger, listen } from 'platform/api/events';
import { Cancellation } from 'platform/api/async';
import {
  SemanticMapControlsOverlayVisualization,
  SemanticMapControlsOverlaySwipe,
  SemanticMapSendMapLayers,
  SemanticMapControlsSyncFromMap,
  SemanticMapControlsSendMapLayersToMap,
  SemanticMapControlsSendMaskIndexToMap,
  SemanticMapControlsSendFeaturesLabelToMap,
  SemanticMapControlsSendFeaturesColorTaxonomyToMap,
  SemanticMapControlsSendGroupColorsAssociationsToMap,
  SemanticMapControlsSendToggle3d,
  SemanticMapControlsSendYear,
  SemanticMapControlsSendVectorLevels,
  SemanticMapControlsRegister,
  SemanticMapControlsUnregister
} from './SemanticMapControlsEvents';
import {
  SemanticMapRequestControlsRegistration
} from './SemanticMapEvents'

import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';

import { CirclePicker, GithubPicker, SwatchesPicker } from 'react-color';
import reactCSS from 'reactcss';
import _ = require('lodash');
import VectorLayer from 'ol/layer/Vector';
import { OverlayTrigger, Tooltip } from 'react-bootstrap';

const sliderbar: CSSProperties = {
  width: '100%',
};

interface Filters {
  feature: boolean;
  overlay: boolean;
  basemap: boolean;
}

interface Timeline {
  mode: "marked" | "normal";
  min: number;
  max: number;
  default: number;
}

interface State {
  overlayOpacity?: number;
  swipeValue?: number;
  overlayVisualization?: string;
  loading?: boolean;
  color: any;
  setColor: any;
  mapLayers: Array<any>;
  maskIndex: number;
  filters: Filters;
  selectedFeaturesLabel: string;
  featuresColorTaxonomy: string;
  featuresColorGroups: string[];
  groupColorAssociations: {};
  displayColorPicker: {};
  year: number;
  yearMarks: number[];
  registeredMap: string;
}

interface Props {
  targetMapId: string;
  id: string;
  featuresTaxonomies: string;
  featuresColorTaxonomies: string;
  featuresOptionsEnabled: boolean;
  filtersInitialization: Filters;
  showFilters?: boolean;
  //TODO: optionals and document
  timeline: Timeline;
}

export class SemanticMapControls extends Component<Props, State> {
  private cancelation = new Cancellation();
  private featuresTaxonomies = [];
  private featuresColorTaxonomies = [];
  private defaultFeaturesColor = 'rgba(200,50,50,0.5)';
  //TODO: fix optionals
  constructor(props: any, context: ComponentContext) {
    super(props, context);
    this.state = {
      overlayOpacity: 1,
      swipeValue: 100,
      overlayVisualization: 'normal',
      color: 'rgba(200,50,50,0.5)',
      setColor: 'rgba(200,50,50,0.5)',
      mapLayers: [],
      maskIndex: -1,
      filters: this.props.filtersInitialization ? this.props.filtersInitialization : {"feature":true,"overlay":true,"basemap":true},
      selectedFeaturesLabel: '',
      featuresColorTaxonomy: this.props.featuresTaxonomies ? this.props.featuresTaxonomies.split(',')[0] : '',
      featuresColorGroups: [],
      displayColorPicker: {},
      groupColorAssociations: {},
      year: this.props.timeline? this.props.timeline.default : new Date().getFullYear(), // Todo fix optional timeline props.
      yearMarks: [],
      registeredMap: ""
    };

    this.handleSelectedLabelChange = this.handleSelectedLabelChange.bind(this);
    this.handleColorTaxonomyChange = this.handleColorTaxonomyChange.bind(this);
    this.handleColorPickerChange = this.handleColorPickerChange.bind(this);
    this.handleGenerateColorPalette = this.handleGenerateColorPalette.bind(this);
    this.handleRestartColorPalette = this.handleRestartColorPalette.bind(this);

    this.cancelation
      .map(
        listen({
          eventType: SemanticMapSendMapLayers,
        })
      )
      .onValue(this.receiveMapLayers);

    this.cancelation.map(listen({
      eventType: SemanticMapRequestControlsRegistration,
    }))
    .onValue(this.handleRequestRegistration);

    this.onDragEnd = this.onDragEnd.bind(this);
  }


  /** REACT COMPONENT LOGIC */
  public componentDidMount() {
    //this.triggerRegisterToMap();
    //this.triggerSyncFromMap();
    //TODO: the map will send the first levels autonomously after the registration 
  }

  public componentWillMount() {
    if(this.props.featuresColorTaxonomies){
      this.featuresTaxonomies = this.props.featuresTaxonomies.split(',');
    }
    if(this.props.featuresTaxonomies){
      this.featuresColorTaxonomies = this.props.featuresColorTaxonomies.split(',');
    }
    console.log("Filters initialization: ", this.props.filtersInitialization);
  }

  public componentWillUnmount() {
    console.log("Will unmount: ", this.props.id)
    this.triggerUnregisterToMap();
  }

  public componentDidUpdate(prevProps, prevState) {
    // TODO: if we care about colors (i.e. historical maps controls don't)
    if (this.state.groupColorAssociations !== prevState.groupColorAssociations) {
      console.log("Groupcolors changed. Sending...")
      this.triggerSendFeaturesColorsAssociationsToMap();
    } else {
      // console.log("Groupcolors NOT changed.")
    }
  }
















  /** EVENTS */

  private handleRequestRegistration = (event: any) => {
    if(this.state.registeredMap == ""){
      this.setState(
        {
          registeredMap: event.data
        },
        () => {
          console.log("Controls", this.props.id, "registered map", this.state.registeredMap)
          //TODO: trigger registrationconfirmation
          this.triggerRegisterToMap()
        }
      )
    } else {
      // console.warn("Controls", this.props.id, "already has a registered map")
    }
  }

  private receiveMapLayers = (event: any) => {
    this.setState(
      {
        mapLayers: event.data,
      },
      () => {
        console.log("Map Controls: '" + this.props.id + "': layers synced from map '" + this.props.targetMapId + "'");
        console.log(event.data);
        if(this.props.timeline){
          if(this.props.timeline.mode == "marked"){
            this.extractYearMarks(this.getAllVectorLayers());
          }
        }
        this.triggerSendYear();
        if(this.props.featuresTaxonomies){
          this.setFeaturesColorTaxonomy();
        }
      }
    );
  };

  private triggerRegisterToMap() {
    console.log("Registration request confirmed. Registering " + this.props.id + " to " + this.props.targetMapId);
    trigger({
      eventType: SemanticMapControlsRegister,
      source: this.props.id,
      targets: [this.props.targetMapId],
    })
  }


  private triggerUnregisterToMap() {
    console.log("Asking unregistering of controls" + this.props.id + " to " + this.props.targetMapId);
    trigger({
      eventType: SemanticMapControlsUnregister,
      source: this.props.id,
      targets: [this.props.targetMapId],
    })
  }

  // TODO: we're trying to avoid using this
  private triggerSyncFromMap(){
    console.log("Syncing " + this.props.id + " from " + this.props.targetMapId);
    trigger({
      eventType: SemanticMapControlsSyncFromMap,
      source: this.props.id,
      targets: [this.props.targetMapId]
    });
  }

  private triggerSendLayers() {
    trigger({
      eventType: SemanticMapControlsSendMapLayersToMap,
      source: this.props.id,
      targets: [this.props.targetMapId],
      data: this.state.mapLayers,
    });
  }

  private triggerSendYear() {
    const year = this.state.year;
    console.log("Sending year " + year + " to map.")
    trigger({
      eventType: SemanticMapControlsSendYear,
      source: this.props.id,
      targets: [this.props.targetMapId],
      data: year.toString() + "-01-01",
    });
  }


  private triggerSendToggle3d() {
    console.log('fired 3d');
    trigger({
      eventType: SemanticMapControlsSendToggle3d,
      source: this.props.id,
      targets: [this.props.targetMapId],
      data: 'toggle',
    });
  }

  private triggerSendFeaturesColorsAssociationsToMap() {
    trigger({
      eventType: SemanticMapControlsSendGroupColorsAssociationsToMap,
      source: this.props.id,
      data: this.state.groupColorAssociations,
      targets: [this.props.targetMapId],
    });
  }

  private triggerSendSwipeValue = (swipeValue: number) => {
    trigger({
      eventType: SemanticMapControlsOverlaySwipe,
      source: this.props.id,
      data: swipeValue,
      targets: [this.props.targetMapId],
    });
  };

  private triggerSendFeaturesLabelToMap() {
    console.log('SENDING FEATURE TAXONOMY');
    console.log(this.state.selectedFeaturesLabel);
    trigger({
      eventType: SemanticMapControlsSendFeaturesLabelToMap,
      source: this.props.id,
      targets: [this.props.targetMapId],
      data: this.state.selectedFeaturesLabel,
    });
  }

  private triggerSendFeaturesColorTaxonomy() {
    console.log('%cSENDING FEATURE COLOR TAXONOMY', 'color: green');
    console.log(this.state.featuresColorTaxonomy);
    trigger({
      eventType: SemanticMapControlsSendFeaturesColorTaxonomyToMap,
      source: this.props.id,
      targets: [this.props.targetMapId],
      data: this.state.featuresColorTaxonomy,
    });
  }

  private triggerVisualization = (visualization: string) => {
    trigger({
      eventType: SemanticMapControlsOverlayVisualization,
      source: this.props.id,
      data: visualization,
      targets: [this.props.targetMapId],
    });
    switch (visualization) {
      case 'swipe': {
        this.triggerSendSwipeValue(this.state.swipeValue);
      }
    }
  };

  private triggerSendMaskIndexToMap(index: number) {
    trigger({
      eventType: SemanticMapControlsSendMaskIndexToMap,
      source: this.props.id,
      targets: [this.props.targetMapId],
      data: index,
    });
  }















  /** UI  */


  handleSelectedLabelChange(e) {
    this.setState(
      {
        selectedFeaturesLabel: e.target.value,
      },
      () => {
        this.triggerSendFeaturesLabelToMap();
      }
    );
  }

  handleColorTaxonomyChange(e) {
    this.setState(
      {
        featuresColorTaxonomy: e.target.value,
      },
      () => {
        this.setFeaturesColorTaxonomy();
      }
    );
  }

  handleColorPickerChange(color, group) {
    console.log('color object');
    console.log(color);
    let color_rgba = color.rgb;
    const rgba_string = 'rgba(' + color_rgba.r + ', ' + color_rgba.g + ', ' + color_rgba.b + ', ' + '0.3' + ')';
    console.log(rgba_string + ' set for Group: ' + group);
    let groupColorAssociationsClone = JSON.stringify(this.state.groupColorAssociations);
    let groupColorAssociationsCloneObject = JSON.parse(groupColorAssociationsClone);
    groupColorAssociationsCloneObject[group] = color;
    this.setState(
      {
        groupColorAssociations: groupColorAssociationsCloneObject,
      },
      () => {
        console.log(this.state.groupColorAssociations);
      }
    );
  }

  private onDragEnd = (result: any) => {
    // dropped outside the list
    if (!result.destination) {
      return;
    }

    //Drag also the mask in case it corresponds to the dragged layer
    if (result.source.index == this.state.maskIndex) {
      this.setMaskIndex(result.destination.index);
    }

    //TODO: if destination position is occupied by a masklayer, remove the visualization mode
    if (result.destination.index == this.state.maskIndex) {
      this.setMaskIndex(-1);
    }

    const mapLayers = this.reorder(this.state.mapLayers, result.source.index, result.destination.index);

    this.setState(
      {
        mapLayers,
      },
      () => {
        this.triggerSendLayers();
      }
    );
  };

  private setMaskIndex(index: number) {
    this.setState(
      {
        maskIndex: index,
        overlayVisualization: 'normal',
      },
      () => {
        this.triggerVisualization(this.state.overlayVisualization);
        this.triggerSendMaskIndexToMap(index);
      }
    );
  }

  handleColorpickerClick = (group: string) => {
    let displayColorPickerClone = this.state.displayColorPicker;
    displayColorPickerClone[group] = !displayColorPickerClone[group];
    this.setState({ displayColorPicker: displayColorPickerClone }, () => {
      console.log('displaypickerclone');
    });
  };

  handleClose = () => {
    var displayColorPickerClone = this.state.displayColorPicker;
    for (let key in displayColorPickerClone) {
      displayColorPickerClone[key] = false;
    }
    this.setState({ displayColorPicker: displayColorPickerClone });
  };










  public render() {
    const styles = reactCSS({
        default: {
            swatch: {
                padding: '2px',
                background: '#fff',
                borderRadius: '50%',
                boxShadow: '0 0 0 1px rgba(0,0,0,.1)',
                display: 'inline-block',
                cursor: 'pointer',
            },
        },
    });

    const controlsStyles = `

    .mapLayersFiltersContainer {
      padding: 5px;
      border: 1px solid rgba(0, 0, 0, 0.1) !important;
      border-radius: 3px;
      margin-top: 5px;
      margin-bottom: 5px;
      -webkit-box-shadow: 1px 1px 3px 0px rgb(137 137 137 / 30%);
      box-shadow: 1px 1px 3px 0px rgb(137 137 137 / 30%);
      height: auto;
      width: 98%;
      margin-left: 1%;
      background-color:rgba(255, 255, 255, 0.7);
  }
  
  .mapLayersFiltersContainer label {
      margin-right: 2px;
  }
  
  .mapLayersFilters {
      margin-left: 3px !important;
      margin-right: 3px !important;
  }
  
  #navigatorContainer input {
      margin-top: 5px;
  }
  
  #mapControlsTitle {
      margin-bottom: 20px;
      font-weight: 200;
      font-size: 20pt;
  }
  
  .draggableLayer {
      border-radius: 3px;
      margin-top: 5px;
      margin-bottom: 5px;
      /* -webkit-box-shadow: 1px 1px 3px 0px rgb(137 137 137 / 30%);
      box-shadow: 1px 1px 3px 0px rgb(137 137 137 / 30%); */
      backdrop-filter: blur(3px);
      height: auto;
      width: 98%;
      margin-left: 1%;
      background-color:rgb(237,237,237);
      padding: 5px;
  }
  
  .draggableMaskLayer {
      border: 1px solid rgba(0, 0, 0, 0.1) !important;
      border-radius: 3px;
      margin-top: 5px;
      margin-bottom: 5px;
      -webkit-box-shadow: 1px 1px 3px 0px rgb(137 137 137 / 30%);
      box-shadow: 1px 1px 3px 0px rgb(137 137 137 / 30%);
      backdrop-filter: blur(3px);
      height: 70px;
      width: 98%;
      margin-left: 1%;
      background-color:rgb(255, 255, 255)
  }
  
  #visualizationModeContainer, .layerMaskIcon.fa-eye {
      background-color: rgb(249 249 249);
      box-shadow: inset 2px 2px 2px rgba(200,200,200,0.5);
  }
  
  #visualizationModeContainer {
      padding: 3px;
      border-radius: 3px;
      margin-top: 3px;
  }
  
  #visualizationModeContainer label {
      font-weight: 300;
      margin: 5px;
      vertical-align: middle;
      font-size: 10pt;
  }
  
  #visualizationModeContainer label input {
      margin-left: 4px;
  }

  .timeSliderContainer {
    margin: 10px;
  }
  
  .mapLayersTitle {
      margin-left: 1%;
      font-weight: 100;
  }
  
  .mapControlsSeparator {
      margin: 5px !important;
      height: 1px !important;
  }
  
  .layerTitle {
      font-weight: 600 !important;
  }
  
  .layerLabel {
      font-size: 10pt;
      font-weight: lighter;
      display: block !important;
  }
  
  
  .layersContainer {
      background-color: white;
      padding: 5px;
      border-radius: 3px;
      /* box-shadow: 2px 3px 9px 0px #2929294d; */
  }
  
  .featuresOptionsContainer {
      background-color: white;
      padding: 5px;
      border-radius: 3px;
  }
  
  .featuresOptionsTitle, .mapOptionsSectionTitle {
      margin-left: 1%;
      font-weight: 100;
  }
  
  .layerThumbnail {
      border-radius: 50%;
      border: 1px solid rgba(255, 255, 255, 0.2) !important;
      height: 60px;
      width: 60px;
      object-fit: cover;
      margin-left: 5px;
  }
  
  .togglesColumn .fa {
      color: rgb(56, 56, 56);
  }
  
  .togglesColumnLeft .fa-bars {
      color: #B1B1B1;
      font-size: 15pt;
  }
  
  .togglesColumnLeft, .togglesColumnRight {
     display: inline-block;
     height: auto;
     padding: 2px;
  }
  
  .togglesColumnLeft {
      vertical-align: middle;
     width: 35px;
  }
  
  .togglesColumnRight {
      text-align: center;
      position: absolute;
      height: 96% !important;
      width: 20px;
  }
  
  .layerCheck {
      top: 0;
      font-size: 20pt;
      color: var(--archipelago-gold);
  }
  
  .layerCheck.fa-toggle-off {
      color: darkgrey !important;
  }
  
  .layerMaskIcon {
      position:absolute;
      bottom: -5px;
      right: 0;
      padding: 3px;
      padding-bottom: 15px;
  }
  
  .visualizationModeRadio {
      vertical-align: middle;
      margin-top: 0 !important;
  }
  
  .layerMaskIcon.fa-eye {
      border-radius: 2px 2px 0 0;
      padding: 5px;
      bottom: 30px !important;
  }
  
  .toggle3dBtn {
      padding: 10px;
      width: 100px;
  }
  
  .opacitySlider {
      width: 100%;
      height: 2px;
      background-image: linear-gradient(to right, var(--color-dark), var(--color-dark));
      outline: none;
      -webkit-transition: .2s;
      transition: opacity .2s;
    }
  
  
    .opacitySlider::-webkit-slider-thumb {
      appearance: none;
      width: 15px;
      height: 15px;
      background: var(--color-dark);
      border: 1px solid var(--color-dark);
      border-radius: 50%;
      cursor: pointer;
      background-image: linear-gradient(var(--color-dark), var(--color-dark)), linear-gradient(to right, rgba(255,250,250, 0.00), rgb(0,60,51));
      background-attachment: fixed, fixed;
      background-clip: padding-box, border-box;
    }
    
    .opacitySlider::-moz-range-thumb {
      width: 15px;
      height: 15px;
      background: var(--color-dark);
      border: 1px solid var(--color-dark);
      border-radius: 50%;
      cursor: pointer;
      background-image: linear-gradient(white, white), linear-gradient(to right, rgba(255,250,250, 0.00), rgb(0,60,51));
      background-attachment: fixed, fixed;
      background-clip: padding-box, border-box;
    }
  
  
  
    .cesium-credit-logoContainer {
        display: none !important;
    }
  
  
    .featuresOptionsDiv {
        display: inline-block;
    }
  
    .featuresOptionsDiv:nth-child(2) {
      margin-left: 20px;
    }
  
    #veniss_navbar {
        height: var(--nav-height) !important;
    }
  
    .clonedNavbar:nth-child(2) {
        display: none !important;
    }
  
    .yearLabel {
      text-shadow: 0px 0px 5px #ffffff;
      font-family: 'Lato' sans-serif;
    }
  
  
  
  .colorsLegend {
      position: fixed;
      left: 100px;
      top: 150px;
      background-color: white;
      border-radius: 5px;
      z-index: 100000000;
      padding: 10px;
    }
  
    `;

    return (
        <div>
            <style>{controlsStyles}</style>
            {this.props.featuresOptionsEnabled && (
        <div className={'featuresOptionsContainer'}>
          {/* <h3 className={'mapOptionsSectionTitle'}>Options</h3> */}
          {/* TODO: move toggle3d button outside features option enabling */}
          <div className={'toggle3dBtn'} onClick={() => this.triggerSendToggle3d()} style={{ cursor: 'pointer' }}>
            <i className="fa fa-cube" aria-hidden="true"></i> Toggle 3d
          </div>
          <div className={'mapLayersFiltersContainer'}>
            <div className={'featuresOptionsDiv'}>
              <label style={{ marginRight: '10px', userSelect: 'none' }}>Color by: </label>
              <select name="featuresColorsList" id="featuresColorsList" onChange={this.handleColorTaxonomyChange}>
                {this.featuresColorTaxonomies.map((taxonomy) => (
                  <option key={taxonomy} value={taxonomy}>
                    {this.capitalizeFirstLetter(taxonomy)}
                  </option>
                ))}
              </select>
              <OverlayTrigger
                key={'random'}
                placement={'top'}
                overlay={<Tooltip id={'tooltip-right'}>Generate a random color palette.</Tooltip>}
              >
                <i
                  className={'fa fa-refresh'}
                  style={{ display: 'inline-block', cursor: 'pointer', marginLeft: '10px', userSelect: 'none' }}
                  onClick={this.handleGenerateColorPalette}
                ></i>
              </OverlayTrigger>
              <OverlayTrigger
                key={'reset'}
                placement={'top'}
                overlay={<Tooltip id={'tooltip-right'}>Restart palette to a single color.</Tooltip>}
              >
                <i
                  className={'fa fa-paint-brush'}
                  style={{ display: 'inline-block', cursor: 'pointer', marginLeft: '10px', userSelect: 'none' }}
                  onClick={this.handleRestartColorPalette}
                ></i>
              </OverlayTrigger>
              <div className={'colorsLegend'}>
                {this.state.featuresColorGroups.map((group, index) => (
                  <div
                    key={group}
                    id={'color-' + group}
                    style={{ display: 'flex', alignItems: 'center', margin: '5px' }}
                  >
                    <div
                      style={styles.swatch}
                      onClick={() => {
                        this.handleColorpickerClick(group);
                      }}
                    >
                      <div
                        style={{
                          width: '15px',
                          height: '15px',
                          borderRadius: '50%',
                          backgroundColor: this.getRgbaString(group),
                        }}
                      />
                    </div>
                    <label style={{ marginLeft: '5px', marginBottom: '0px' }}>{group}</label>
                    {this.state.displayColorPicker[group] && (
                      <div style={{ position: 'absolute', zIndex: 2 }}>
                        <div
                          style={{ position: 'fixed', top: '0px', right: '0px', left: '0px', bottom: '0px' }}
                          onClick={this.handleClose}
                        />
                        <SwatchesPicker
                          color={this.state.groupColorAssociations[group]}
                          onChange={(color) => {
                            this.handleColorPickerChange(color, group);
                          }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className={'featuresOptionsDiv'}>
              <label style={{ marginRight: '10px', userSelect: 'none' }}>Label by: </label>
              <select name="featuresLabelList" id="featuresLabelList" onChange={this.handleSelectedLabelChange}>
                <option key={'none'} value={'none'}>
                  None
                </option>
                {this.featuresTaxonomies.map((taxonomy) => (
                  <option key={taxonomy} value={taxonomy}>
                    {this.capitalizeFirstLetter(taxonomy)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
                  {this.props.timeline && (
                <div className={'timeSliderContainer'}>
                    {this.props.timeline.mode === "marked" && (
                        <React.Fragment>
                            <div className={'yearLabel'} style={{ position: 'fixed', bottom: '10', left: '10', fontSize: '20pt' }}>{this.state.year}</div>
                        </React.Fragment>
                    )}
                    {this.props.timeline.mode === "normal" && (
                        <React.Fragment>
                            <input
                                type={'range'}
                                className={'timelineSlider'}
                                min={this.props.timeline.min}
                                max={this.props.timeline.max}
                                step={1}
                                value={this.state.year}
                                onChange={(event) => {
                                    const input = event.target as HTMLInputElement;
                                    const value = parseInt(input.value);
                                    this.setState({
                                        year: value,
                                    }, () => {
                                        this.triggerSendYear();
                                    });
                                }}
                            />
                            <div className={'yearLabel'} style={{ position: 'fixed', bottom: '10', left: '10', fontSize: '20pt' }}>{this.state.year}</div>
                        </React.Fragment>
                    )}
                </div>
            )}
      <br/>
      <DragDropContext onDragEnd={this.onDragEnd}>
        <Droppable droppableId="droppable">
          {(provided, snapshot) => (
            <div {...provided.droppableProps} ref={provided.innerRef} className={'layersContainer'}>
              {/* <h3 className={'mapLayersTitle'}>Map Layers</h3> */}
              {this.props.showFilters && (
                <div className="mapLayersFiltersContainer">
                  <label>Filter:</label>
                  <input
                    className="mapLayersFilters"
                    name={'overlay-visualization'}
                    type={'checkbox'}
                    checked={this.state.filters.feature}
                    onChange={(event) => {
                      this.setState({ filters: { ...this.state.filters, feature: event.target.checked } }, () => { });
                    }}
                  ></input>
                  <label className="fitersLabel">Features</label>
                  <input
                    className="mapLayersFilters"
                    name={'overlay-visualization'}
                    type={'checkbox'}
                    checked={this.state.filters.overlay}
                    onChange={(event) => {
                      this.setState({ filters: { ...this.state.filters, overlay: event.target.checked } }, () => { });
                    }}
                  ></input>
                  <label className="fitersLabel">Overlays</label>
                  <input
                    className="mapLayersFilters"
                    name={'overlay-visualization'}
                    type={'checkbox'}
                    checked={this.state.filters.basemap}
                    onChange={(event) => {
                      this.setState({ filters: { ...this.state.filters, basemap: event.target.checked } }, () => { });
                    }}
                  ></input>
                  <label className="fitersLabel">Basemaps</label>
                </div>
              )}
              {/* <hr className={'mapControlsSeparator'} style={{ margin: '0px !important' }}></hr> */}
              {this.state.mapLayers.map(
                (mapLayer, index) =>
                  this.state.filters[mapLayer.get('level')] && (
                    <Draggable key={mapLayer.get('identifier')} draggableId={mapLayer.get('identifier')} index={index}>
                      {(provided, snapshot) => (
                        <div
                          className={`draggableLayer ${mapLayer.get('visible') ? 'visible' : 'nonvisible'}`}
                          ref={provided.innerRef}
                          style={{ border: '1px solid red !important;', borderRadius: '2px' }}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                        >
                          <div className="togglesColumnLeft">
                            <i className="fa fa-bars"></i>
                          </div>
                          <div style={{ verticalAlign: 'middle', display: 'inline-block' }}>
                            <img
                              src={mapLayer.get('thumbnail')}
                              className={'layerThumbnail'}
                              style={{
                                borderRadius: '50%',
                                border: '1px solid rgba(255, 255, 255, 0.2)',
                                height: '60px',
                                width: '60px',
                                objectFit: 'cover',
                                marginLeft: '5px',
                              }}
                            /> 
                          </div>
                          <div style={{ display: 'inline-block', verticalAlign: 'middle', padding: '10px' }}>
                            <div style={{ width: '250px' }}>
                              <label className={'layerTitle'}>{mapLayer.get('author')}</label>
                              <div>
                                <label className={'layerLabel'}>
                                  <span>{mapLayer.get('name')}</span>
                                </label>
                                <label className={'layerLabel'}>{mapLayer.get('year')}</label>
                                {/*<label className={'layerLabel'}>{mapLayer.get('location')}</label>*/}
                                <input
                                  type={'range'}
                                  className={'opacitySlider'}
                                  min={0}
                                  max={1}
                                  step={0.01}
                                  value={mapLayer.get('opacity')}
                                  onChange={(event) => {
                                    const input = event.target as HTMLInputElement;
                                    const opacity = parseFloat(input.value);
                                    const capped = isNaN(opacity) ? 0.5 : Math.min(1, Math.max(0, opacity));
                                    this.setMapLayerProperty(mapLayer.get('identifier'), 'opacity', capped);
                                  }}
                                ></input>
                              </div>
                            </div>
                          </div>
                          <div className="togglesColumnRight" style={{ display: 'inline-block' }}>
                            {mapLayer.get('visible') && (
                              <i
                                className="fa fa-toggle-on layerCheck"
                                style={{ cursor: 'pointer' }}
                                onClick={() => {
                                  this.setMapLayerProperty(mapLayer.get('identifier'), 'visible', false);
                                  if (this.state.maskIndex == index) {
                                    this.setMaskIndex(-1);
                                  }
                                }}
                              ></i>
                            )}
                            {!mapLayer.get('visible') && (
                              <i
                                className="fa fa-toggle-off layerCheck"
                                style={{ cursor: 'pointer' }}
                                onClick={() => {
                                  this.setMapLayerProperty(mapLayer.get('identifier'), 'visible', true);
                                }}
                              ></i>
                            )}
                            {this.state.maskIndex == index && (
                              <i
                                className="fa fa-eye layerMaskIcon"
                                style={{ cursor: 'pointer' }}
                                onClick={() => {
                                  this.setMaskIndex(-1);
                                }}
                              ></i>
                            )}
                            {this.state.maskIndex !== index && (
                              <i
                                className="fa fa-eye-slash layerMaskIcon"
                                style={{ cursor: 'pointer', color: 'rgba(200,200,200,1)' }}
                                onClick={() => {
                                  if (!mapLayer.get('visible')) {
                                    this.setMapLayerProperty(mapLayer.get('identifier'), 'visible', true);
                                  }
                                  this.setMaskIndex(index);
                                }}
                              ></i>
                            )}
                          </div>
                          {this.state.maskIndex == index && (
                            <div id={'visualizationModeContainer'}>
                              <input
                                className="visualizationModeRadio"
                                name={'overlay-visualization'}
                                type={'radio'}
                                value={'normal'}
                                checked={this.state.overlayVisualization === 'normal'}
                                onChange={(event) => {
                                  this.setState({ overlayVisualization: event.target.value }, () =>
                                    this.triggerVisualization(this.state.overlayVisualization)
                                  );
                                }}
                              ></input>
                              <label style={{ margin: '2px' }}>Normal</label>
                              <input
                                className="visualizationModeRadio"
                                name={'overlay-visualization'}
                                type={'radio'}
                                value={'spyglass'}
                                checked={this.state.overlayVisualization === 'spyglass'}
                                onChange={(event) => {
                                  this.setState({ overlayVisualization: event.target.value }, () =>
                                    this.triggerVisualization(this.state.overlayVisualization)
                                  );
                                }}
                              ></input>
                              <label style={{ margin: '2px' }}>Spyglass</label>
                              <input
                                className="visualizationModeRadio"
                                name={'overlay-visualization'}
                                type={'radio'}
                                value={'swipe'}
                                checked={this.state.overlayVisualization === 'swipe'}
                                onChange={(event) => {
                                  this.setState({ overlayVisualization: event.target.value }, () =>
                                    this.triggerVisualization(this.state.overlayVisualization)
                                  );
                                }}
                              ></input>
                              <label style={{ margin: '2px' }}>Swipe</label>
                              {this.state.overlayVisualization === 'swipe' && (
                                <input
                                  id={'swipe'}
                                  type={'range'}
                                  min={0}
                                  max={100}
                                  step={1}
                                  style={{ width: '100%' }}
                                  value={this.state.swipeValue as any}
                                  onChange={(event) => {
                                    const input = event.target as HTMLInputElement;
                                    const input2 = input.value;
                                    this.setState({ swipeValue: Number(input2) }, () =>
                                      this.triggerSendSwipeValue(this.state.swipeValue)
                                    );
                                  }}
                                ></input>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </Draggable>
                  )
              )}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
      <br/>
    </div>
  )}

  private reorder = (list, startIndex, endIndex) => {
    const result = Array.from(list);
    const [removed] = result.splice(startIndex, 1);
    result.splice(endIndex, 0, removed);

    return result;
  };

  private setFeaturesColorTaxonomy() {
    let groups = this.getGroupsFromTaxonomy(this.state.featuresColorTaxonomy, this.getAllVectorLayers());
    this.setState(
      {
        featuresColorGroups: groups,
      },
      () => {
        this.triggerSendFeaturesColorTaxonomy();
        this.initializeGroupColorAssociations(this.state.featuresColorGroups);
      }
    );
  }

  private getGroupsFromTaxonomy(taxonomy, vectorLayers) {
    let groups = [];
    if (taxonomy) {
      vectorLayers.forEach((vectorLayer) => {
        vectorLayer
          .getSource()
          .getFeatures()
          .forEach((feature) => {
            if (feature.get(taxonomy)) {
              let grouping = feature.get(taxonomy).value;
              if (!groups.includes(grouping)) {
                groups.push(grouping);
              }
            }
          });
      });
    }
    return groups;
  }

  /* accepts parameters
   * h  Object = {h:x, s:y, v:z}
   * OR
   * h, s, v
   */
  private HSVtoRGB(h, s, v) {
    var r, g, b, i, f, p, q, t;
    if (arguments.length === 1) {
      (s = h.s), (v = h.v), (h = h.h);
    }
    i = Math.floor(h * 6);
    f = h * 6 - i;
    p = v * (1 - s);
    q = v * (1 - f * s);
    t = v * (1 - (1 - f) * s);
    switch (i % 6) {
      case 0:
        (r = v), (g = t), (b = p);
        break;
      case 1:
        (r = q), (g = v), (b = p);
        break;
      case 2:
        (r = p), (g = v), (b = t);
        break;
      case 3:
        (r = p), (g = q), (b = v);
        break;
      case 4:
        (r = t), (g = p), (b = v);
        break;
      case 5:
        (r = v), (g = p), (b = q);
        break;
    }
    let rgb = {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255),
    };
    return 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',0.4)';
  }

  private handleGenerateColorPalette() {
    this.generateColorPalette();
  }

  private handleRestartColorPalette() {
    this.initializeGroupColorAssociations(
      this.getGroupsFromTaxonomy(this.state.featuresColorTaxonomy, this.getAllVectorLayers(this.state.mapLayers))
    );
  }

  private generateColorPalette() {
    //TODO: give possibility to set a colorpalette from the props
    let colorNumbers = this.state.featuresColorGroups.length;
    let palette = [
      "rgba(245,185,153,0.6)",
      "rgba(124,164,204,0.6)",
      "rgb(183,161,209,0.6)",
      "rgba(0,63,114,0.6)",
      "rgba(173,195,165,0.6)",
      "rgba(214,223,218,0.6)",
    ];
    /*
    let hueFraction = 360 / colorNumbers;
    let seed = Math.floor(Math.random() * 360);
    for (let i = 0; i < colorNumbers; i++) {
      let generatedAngle = hueFraction * i + seed;
      if (generatedAngle > 360) {
        generatedAngle -= 360;
      }
      palette.push({
        h: generatedAngle.toString(),
        s: '0.4',
        l: '0.7',
        a: '0.4',
      });
    }
    */

    //Update state with generated palette
    let groupColorAssociationsClone = JSON.stringify(this.state.groupColorAssociations);
    let groupColroAssociationsCloneObject = JSON.parse(groupColorAssociationsClone)
    let _i = 0;
    for (let association in groupColroAssociationsCloneObject) {
      //groupColorAssociationsClone[association] = "hsv(" + palette[_i].h + ","+palette[_i].s+","+palette[_i].v+",0.4)";
      let rgbstring = palette[_i];
      groupColroAssociationsCloneObject[association] = rgbstring;
      _i++;
    }
    this.setState(
      {
        groupColorAssociations: groupColroAssociationsCloneObject,
      },
      () => {
        //console.log('New GroupColorAssociations:');
        //console.log(this.state.groupColorAssociations);
      }
    );
  }

  private getAllVectorLayers(allLayers?) {
    if (!allLayers) {
      allLayers = this.state.mapLayers;
    }
    let vectorLayers = [];
    allLayers.forEach((layer) => {
      if (layer instanceof VectorLayer) {
        vectorLayers.push(layer);
      }
    });
    return vectorLayers;
  }

  private extractYearMarks(vectorLayers){
    let marks = [];
    console.log("Extracting year marks for: ", vectorLayers);
    vectorLayers.forEach((vectorLayer) => {
      vectorLayer
        .getSource()
        .getFeatures()
        .forEach((feature) => {
          if (feature.get('bob').value) {
            marks.push(Number(feature.get('bob').value));
          }
        });
    });
    console.log("Extracted marks", marks)
    this.setState({
      yearMarks: marks.sort()
    },
    () => {
      console.log("Now marks are:", this.state.yearMarks)
    })
  }

findClosestMark(value, marks) {
    return marks.reduce((prev, curr) => {
        return (Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev);
    });
}

  private capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  }

  private getRgbaString(group) {
    let rgba_string = '';
    if (
      group in this.state.groupColorAssociations &&
      this.state.groupColorAssociations[group] &&
      this.state.groupColorAssociations[group] !== this.defaultFeaturesColor &&
      this.state.groupColorAssociations[group] !== ''
    ) {
      if (typeof this.state.groupColorAssociations[group] === 'string') {
        return this.state.groupColorAssociations[group];
      } else {
        let color = this.state.groupColorAssociations[group];
        let color_rgba = color.rgb;
        rgba_string = 'rgba(' + color_rgba.r + ', ' + color_rgba.g + ', ' + color_rgba.b + ', ' + '0.4' + ')';
      }
    } else {
      rgba_string = this.defaultFeaturesColor;
    }
    return rgba_string;
  }

  private initializeGroupColorAssociations(groups: string[]) {
    let colorGroups = {};
    let displayColorPickerNew = {};
    groups.forEach((group) => {
      colorGroups[group] = this.defaultFeaturesColor;
      displayColorPickerNew[group] = false;
    });
    this.setState(
      {
        groupColorAssociations: colorGroups,
        displayColorPicker: displayColorPickerNew,
      },
      () => {
        console.log('GroupColorassociations intialized. Here are the associations:');
        console.log(this.state.groupColorAssociations);
        this.generateColorPalette();
      }
    );
  }

  private setMapLayerProperty(identifier, propertyName, propertyValue) {
    let mapLayersClone = this.state.mapLayers;
    mapLayersClone.forEach(function (mapLayer) {
      if (mapLayer.get('identifier') === identifier) {
        mapLayer.set(propertyName, propertyValue);
      }
    });

    this.setState({ mapLayers: mapLayersClone }, () => {
      this.triggerSendLayers();
    });
  }


}

export default SemanticMapControls;
