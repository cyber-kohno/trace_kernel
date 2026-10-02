namespace ResourceState {
  export type ParseMethod = 'csv' | 'tsv';
  export type Encoding = 'utf8' | 'sjis';
  export type Props = {
    varName: string;
    source: string;
    parse?: ParseMethod;
    parseValidated?: true;
  };

  export const getInitial = (varName: string): Props => {
    return {
      varName,
      source: '',
    };
  };
}
export default ResourceState;
