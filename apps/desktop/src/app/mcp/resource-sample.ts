import type ResourceState from '../state/model/workspace/resource-state';
import DataUtil from '../util/data/data-util';

namespace ResourceSample {
  export const create = (resource: ResourceState.Props) => {
    if (resource.parse == null) {
      return {
        varName: resource.varName,
        parse: null,
        headers: [],
        rows: [],
        totalRows: null,
        sampleText: resource.source.slice(0, 4096),
        truncated: resource.source.length > 4096,
      };
    }

    // Parse the complete input before sampling so validation and inferred types
    // match GUI parsing and Work Context Injection, including later records.
    const records = DataUtil.convertTableToJson(
      resource.source,
      resource.parse,
    );
    const headers = DataUtil.convertTableToColDefs(
      resource.source,
      resource.parse,
    ).map((column) => column.name);

    return {
      varName: resource.varName,
      parse: resource.parse,
      headers,
      rows: records
        .slice(0, 10)
        .map((record) => headers.map((header) => record[header])),
      totalRows: records.length,
    };
  };
}

export default ResourceSample;
