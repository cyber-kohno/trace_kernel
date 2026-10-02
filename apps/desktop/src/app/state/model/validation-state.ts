namespace ValidationState {
  export type Category =
    | 'env'
    | 'resource'
    | 'dataset'
    | 'process'
    | 'logic'
    | 'work';

  export type Target = {
    cat: Category;
    index: number;
  };

  export type StoreValue = {
    disables: Target[];
  };

  export const getInitial = (): StoreValue => ({
    disables: [],
  });
}

export default ValidationState;
