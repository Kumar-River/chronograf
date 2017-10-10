import React, {PropTypes, Component} from 'react'
import _ from 'lodash'
import Graph from 'react-graph-vis'
import { compose, withProps, withStateHandlers } from "recompose";
import { withScriptjs, withGoogleMap, GoogleMap, Marker, InfoWindow,} from "react-google-maps";
import MarkerClusterer from "react-google-maps/lib/components/addons/MarkerClusterer";

import SearchBar from 'src/hosts/components/SearchBar'
import HostRow from 'src/hosts/components/HostRow'

import {HOSTS_TABLE} from 'src/hosts/constants/tableSizing'

var viewTypes = ["Table", "Network", "Map"];

// Start of Network graph data
const mNetWorkOptions = {
  layout: {
    hierarchical: false
  },
  edges: {
    color: "#000000"
  },
  physics:{
    enabled: true
  }
};

const mNetworkEvents = {
  select: function(event) {
    var { nodes, edges } = event;
  }
};
// End of Network graph data

// Start of Geo Map data
const mMapCenterLatLng = { lat: 39.446376, lng: -101.777344 }
const mMapRadiusLimit = 100000; //in meters
var mMarkers = []

const MapWithAMarkerClusterer = compose(
  withProps({
    googleMapURL: "https://maps.googleapis.com/maps/api/js?key=AIzaSyDdkCu8mK6Qp5G8F-VI0FDK6hClMM-y1l4&v=3.exp&libraries=geometry,drawing,places",
    loadingElement: <div style={{ height: `100%` }} />,
    containerElement: <div style={{ height: `500px` }} />,
    mapElement: <div style={{ height: `100%` }} />,
  }),
  withStateHandlers(() => ({
    isOpen: false,
  }), {
    onToggleOpen: ({ isOpen }) => () => ({
      isOpen: !isOpen,
    })
  }),
  withScriptjs,
  withGoogleMap
)(props =>
  <GoogleMap
    defaultZoom={8}
    defaultCenter={mMapCenterLatLng}
  >
    <MarkerClusterer
      averageCenter
      enableRetinaIcons
      gridSize={60}
    >
      {props.markers.map(marker => (
        <Marker
          key={marker.id}
          position={{ lat: marker.latitude, lng: marker.longitude }}
          onClick={props.onToggleOpen}
        >
          {props.isOpen && <InfoWindow onCloseClick={props.onToggleOpen}>
            <div>
                <label style={{color: "#000000"}}>{marker.title}</label>
            </div>
          </InfoWindow>}
        </Marker>
      ))}
    </MarkerClusterer>
  </GoogleMap>
);
// End of Map

class HostsTable extends Component {

  constructor(props) {
    super(props)

    this.state = {
      searchTerm: '',
      sortDirection: null,
      sortKey: null,
      currentViewType: viewTypes[0],
      graph: {
        nodes: [],
        edges: []
      },
      markers: mMarkers
    }
  }
 
  componentWillReceiveProps(nextProps) {
    var sGraph= {
        nodes: [{ id: 0, label: "Switch", color: "#d5d53e" }],
        edges: []
      }

    mMarkers = []
    
    for(var i=1; i<=nextProps.hosts.length; i++) {

      var host = nextProps.hosts[i-1]
      var colorStatus = Math.max(host.deltaUptime || 0, host.winDeltaUptime || 0) > 0  ? '#4ed8a0' : '#dc4e58'

      sGraph.nodes.push({id: i, label: host.name, color: colorStatus})
      sGraph.edges.push({from: 0, to: i})

      var coordinates = this.randomGeo(mMapCenterLatLng, mMapRadiusLimit)

      mMarkers.push({id:i-1, title: host.name, latitude: Number(coordinates.latitude), longitude: Number(coordinates.longitude)})
    }      

    this.setState({graph: sGraph})
    this.setState({markers: mMarkers})
  }

  filter(allHosts, searchTerm) {
    const filterText = searchTerm.toLowerCase()
    return allHosts.filter(h => {
      const apps = h.apps ? h.apps.join(', ') : ''
      // search each tag for the presence of the search term
      let tagResult = false
      if (h.tags) {
        tagResult = Object.keys(h.tags).reduce((acc, key) => {
          return acc || h.tags[key].toLowerCase().includes(filterText)
        }, false)
      } else {
        tagResult = false
      }
      return (
        h.name.toLowerCase().includes(filterText) ||
        apps.toLowerCase().includes(filterText) ||
        tagResult
      )
    })
  }

  sort(hosts, key, direction) {
    switch (direction) {
      case 'asc':
        return _.sortBy(hosts, e => e[key])
      case 'desc':
        return _.sortBy(hosts, e => e[key]).reverse()
      default:
        return hosts
    }
  }

  updateSearchTerm = term => {
    this.setState({searchTerm: term})

    const {searchTerm, sortKey, sortDirection} = this.state
    const sortedHosts = this.sort(
      this.filter(this.props.hosts, searchTerm),
      sortKey,
      sortDirection
    )    

    var sGraph= {
        nodes: [{ id: 0, label: "Switch", color: "#d5d53e" }],
        edges: []
      }

    var sMarkers = []

    for(var i=1; i<=sortedHosts.length; i++) {

      var host = sortedHosts[i-1]
      var colorStatus = Math.max(host.deltaUptime || 0, host.winDeltaUptime || 0) > 0  ? '#4ed8a0' : '#dc4e58'

      sGraph.nodes.push({id: i, label: host.name, color: colorStatus})
      sGraph.edges.push({from: 0, to: i})

      for(var j=0; j<mMarkers.length; j++) {
        if (mMarkers[j].title.toLowerCase() === host.name.toLowerCase()) {
          sMarkers.push(mMarkers[j])
          break;
        }        
      }      
    }

    this.setState({graph: sGraph})
    this.setState({markers: sMarkers})
  }

  updateSort = key => () => {
    // if we're using the key, reverse order; otherwise, set it with ascending
    if (this.state.sortKey === key) {
      const reverseDirection =
        this.state.sortDirection === 'asc' ? 'desc' : 'asc'
      this.setState({sortDirection: reverseDirection})
    } else {
      this.setState({sortKey: key, sortDirection: 'asc'})
    }
  }

  sortableClasses = key => {
    if (this.state.sortKey === key) {
      if (this.state.sortDirection === 'asc') {
        return 'sortable-header sorting-ascending'
      }
      return 'sortable-header sorting-descending'
    }
    return 'sortable-header'
  }

  setViewType(event) {
    this.setState({currentViewType: event.target.value})
  }

  // Get random coordinates
  randomGeo(center, radius) {
    var y0 = center.lat;
    var x0 = center.lng;
    var rd = radius / 111300; //about 111300 meters in one degree

    var u = Math.random();
    var v = Math.random();

    var w = rd * Math.sqrt(u);
    var t = 2 * Math.PI * v;
    var x = w * Math.cos(t);
    var y = w * Math.sin(t);

    //Adjust the x-coordinate for the shrinking of the east-west distances
    var xp = x / Math.cos(y0);

    var newlat = y + y0;
    var newlon = x + x0;
    var newlon2 = xp + x0;

    return {
        'latitude': newlat.toFixed(5),
        'longitude': newlon.toFixed(5),
        'longitude2': newlon2.toFixed(5)
    };
  }
  // End get random coordiantes

  render() {
    const {searchTerm, sortKey, sortDirection, currentViewType, graph} = this.state
    const {hosts, hostsLoading, hostsError, source} = this.props
    const sortedHosts = this.sort(
      this.filter(hosts, searchTerm),
      sortKey,
      sortDirection
    )
    const hostCount = sortedHosts.length
    const {colName, colStatus, colCPU, colLoad} = HOSTS_TABLE

    let hostsTitle

    if (hostsLoading) {
      hostsTitle = 'Loading Hosts...'
    } else if (hostsError.length) {
      hostsTitle = 'There was a problem loading hosts'
    } else if (hostCount === 1) {
      hostsTitle = `${hostCount} Host`
    } else {
      hostsTitle = `${hostCount} Hosts`
    }
        
    return (
      <div className="panel panel-minimal">
        <div className="panel-heading u-flex u-ai-center u-jc-space-between">
          <h2 className="panel-title">
            {hostsTitle}
          </h2>

          <div onChange={event => this.setViewType(event)}>
            <input type="radio" value={viewTypes[0]} name="viewType" defaultChecked /> <label style={{marginRight: '15px'}}> Table </label>
            <input type="radio" value={viewTypes[1]} name="viewType" /> <label style={{marginRight: '15px'}}> Network </label>
            <input type="radio" value={viewTypes[2]} name="viewType" /> <label style={{marginRight: '15px'}}> Map </label>
          </div>

          <SearchBar onSearch={this.updateSearchTerm} />
        </div>
        <div className="panel-body">
          {hostCount > 0 && !hostsError.length && currentViewType === viewTypes[0]
            ?            
              <table className="table v-center table-highlight">
                <thead>
                  <tr>
                    <th
                      onClick={this.updateSort('name')}
                      className={this.sortableClasses('name')}
                      style={{width: colName}}
                    >
                      Host
                    </th>
                    <th
                      onClick={this.updateSort('deltaUptime')}
                      className={this.sortableClasses('deltaUptime')}
                      style={{width: colStatus}}
                    >
                      Status
                    </th>
                    <th
                      onClick={this.updateSort('cpu')}
                      className={this.sortableClasses('cpu')}
                      style={{width: colCPU}}
                    >
                      CPU
                    </th>
                    <th
                      onClick={this.updateSort('load')}
                      className={this.sortableClasses('load')}
                      style={{width: colLoad}}
                    >
                      Load
                    </th>
                    <th>Apps</th>
                  </tr>
                </thead>

                <tbody>
                  {sortedHosts.map(h =>
                    <HostRow key={h.name} host={h} source={source} />
                  )}
                </tbody>
              </table>

            :
            (hostCount > 0 && !hostsError.length && currentViewType === viewTypes[1])
            ?
              <Graph style={{ height: "500px" }} graph={graph} options={mNetWorkOptions} events={mNetworkEvents} />
            :
            (hostCount > 0 && !hostsError.length && currentViewType === viewTypes[2])
            ?
              <MapWithAMarkerClusterer markers={this.state.markers} />
            : 
              <div className="generic-empty-state">
                <h4 style={{margin: '90px 0'}}>No Hosts found</h4>
              </div>}
        </div>
      </div>
    )
  }
}

const {arrayOf, bool, number, shape, string} = PropTypes

HostsTable.propTypes = {
  hosts: arrayOf(
    shape({
      name: string,
      cpu: number,
      load: number,
      apps: arrayOf(string.isRequired),
    })
  ),
  hostsLoading: bool,
  hostsError: string,
  source: shape({
    id: string.isRequired,
    name: string.isRequired,
  }).isRequired,
}

export default HostsTable
