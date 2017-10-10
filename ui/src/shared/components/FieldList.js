import React, {PropTypes, Component} from 'react'
import _ from 'lodash'

import FieldListItem from 'src/data_explorer/components/FieldListItem'
import GroupByTimeDropdown from 'src/data_explorer/components/GroupByTimeDropdown'
import FillQuery from 'shared/components/FillQuery'
import FancyScrollbar from 'shared/components/FancyScrollbar'

import {showFieldKeys} from 'shared/apis/metaQuery'
import showFieldKeysParser from 'shared/parsing/showFieldKeys'

class FieldList extends Component {
  constructor(props) {
    super(props)
    this.state = {
      fields: [],
    }
  }

  componentDidMount() {
    const {database, measurement} = this.props.query
    if (!database || !measurement) {
      return
    }

    this._getFields()
  }

  componentDidUpdate(prevProps) {
    const {querySource, query} = this.props
    const {database, measurement, retentionPolicy} = query
    const {
      database: prevDB,
      measurement: prevMeas,
      retentionPolicy: prevRP,
    } = prevProps.query
    if (!database || !measurement) {
      return
    }

    if (
      database === prevDB &&
      measurement === prevMeas &&
      retentionPolicy === prevRP &&
      _.isEqual(prevProps.querySource, querySource)
    ) {
      return
    }

    this._getFields()
  }

  handleGroupByTime = groupBy => {
    this.props.onGroupByTime(groupBy.menuOption)
  }

  handleFill = fill => {
    this.props.onFill(fill)
  }

  _getFields = () => {
    const {database, measurement, retentionPolicy} = this.props.query
    const {source} = this.context
    const {querySource} = this.props

    const proxy =
      _.get(querySource, ['links', 'proxy'], null) || source.links.proxy

    showFieldKeys(proxy, database, measurement, retentionPolicy).then(resp => {
      const {errors, fieldSets} = showFieldKeysParser(resp.data)
      if (errors.length) {
        console.error('Error parsing fields keys: ', errors)
      }

      this.setState({
        fields: fieldSets[measurement].map(f => ({field: f, funcs: []})),
      })
    })
  }

  render() {
    const {
      query: {fields = [], groupBy, fill},
      isKapacitorRule,
      isInDataExplorer,
    } = this.props

    const hasAggregates = fields.some(f => f.funcs && f.funcs.length)
    const hasGroupByTime = groupBy.time

    return (
      <div className="query-builder--column">
        <div className="query-builder--heading">
          <span>Fields</span>
          {hasAggregates
            ? <div className="query-builder--groupby-fill-container">
                <GroupByTimeDropdown
                  isOpen={!hasGroupByTime}
                  selected={groupBy.time}
                  onChooseGroupByTime={this.handleGroupByTime}
                  isInRuleBuilder={isKapacitorRule}
                  isInDataExplorer={isInDataExplorer}
                />
                {isKapacitorRule
                  ? null
                  : <FillQuery value={fill} onChooseFill={this.handleFill} />}
              </div>
            : null}
        </div>
        {this.renderList()}
      </div>
    )
  }

  renderList() {
    const {database, measurement, fields = []} = this.props.query
    if (!database || !measurement) {
      return (
        <div className="query-builder--list-empty">
          <span>
            No <strong>Measurement</strong> selected
          </span>
        </div>
      )
    }

    return (
      <div className="query-builder--list">
        <FancyScrollbar>
          {this.state.fields.map(fieldFunc => {
            const selectedField = fields.find(f => f.field === fieldFunc.field)
            return (
              <FieldListItem
                key={fieldFunc.field}
                onToggleField={this.props.onToggleField}
                onApplyFuncsToField={this.props.applyFuncsToField}
                isSelected={!!selectedField}
                fieldFunc={selectedField || fieldFunc}
                isKapacitorRule={this.props.isKapacitorRule}
              />
            )
          })}
        </FancyScrollbar>
      </div>
    )
  }
}

const {bool, func, shape, string} = PropTypes

FieldList.defaultProps = {
  isKapacitorRule: false,
}

FieldList.contextTypes = {
  source: shape({
    links: shape({
      proxy: string.isRequired,
    }).isRequired,
  }).isRequired,
}

FieldList.propTypes = {
  query: shape({
    database: string,
    retentionPolicy: string,
    measurement: string,
  }).isRequired,
  onToggleField: func.isRequired,
  onGroupByTime: func.isRequired,
  onFill: func,
  applyFuncsToField: func.isRequired,
  isKapacitorRule: bool,
  isInDataExplorer: bool,
  querySource: shape({
    links: shape({
      proxy: string.isRequired,
    }).isRequired,
  }),
}

export default FieldList
