import type ResourceState from '../../../state/model/workspace/resource-state';
import DataUtil from '../../../util/data/data-util';

export const clearParseValidation = (resource: ResourceState.Props) => {
  delete resource.parseValidated;
};

export const setResourceSource = (
  resource: ResourceState.Props,
  source: string,
) => {
  resource.source = source;
  if (resource.parse != undefined) {
    clearParseValidation(resource);
  }
};

export const setResourceParseMethod = (
  resource: ResourceState.Props,
  parse: ResourceState.ParseMethod | undefined,
) => {
  resource.parse = parse;
  clearParseValidation(resource);
};

export const validateResourceParse = (resource: ResourceState.Props) => {
  if (resource.parse == undefined) {
    throw new Error('Parse method is not selected.');
  }

  return DataUtil.convertTableToJson(resource.source, resource.parse);
};

export const createParsePreview = (
  parseMethod: ResourceState.ParseMethod | undefined,
  records: Record<string, any>[],
) => {
  if (parseMethod == undefined) {
    throw new Error('Parse method is not selected.');
  }

  const lines: string[] = [];
  const append = (line: string) => lines.push(line);

  append(`Start parsing the ${parseMethod}.`);
  append(`There are ${records.length} records.`);
  append('');
  append('Columns');
  append('------------------------');

  const firstRecord = records[0];
  if (firstRecord != undefined) {
    Object.keys(firstRecord).forEach((key) => {
      append(`- ${key}`);
    });
  }

  append('------------------------');
  append('');
  append('Records');

  records.forEach((record, index) => {
    append('');
    append(`Line ${index}`);
    append('-----');
    Object.values(record).forEach((value) => {
      append(`[${value}]`);
    });
  });

  append('------------------------');
  append('Successful completion!');

  return lines.join('\n');
};
