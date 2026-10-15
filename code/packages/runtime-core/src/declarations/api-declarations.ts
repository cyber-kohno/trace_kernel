import DclFileSystem from "../api/fs/dcl-file-system";
import DclRuntime from "../api/dcl-runtime";
import DclNet from "../api/dcl-net";
import DclState from "../api/dcl-state";
import DclChannel from "../api/dcl-channel";
import DclParser from "../api/parser/dcl-parser";
import type { ReservedApi } from "../execution/work-execution-plan";

namespace ApiDeclarations {
  export const createUtilDeclareDef = (
    name: ReservedApi,
  ): {
    typeDec: string;
    valueDec: string;
  } => {
    switch (name) {
      case "print":
      case "println":
        return {
          typeDec: "",
          valueDec: "(str: string) => void",
        };
      case "channel":
        return {
          typeDec: DclChannel.getTypeDeclare(),
          valueDec: DclChannel.getValueDeclare(),
        };
      case "runtime":
        return {
          typeDec: "",
          valueDec: DclRuntime.getDeclare(),
        };
      case "net":
        return {
          typeDec: DclNet.getTypeDeclare(),
          valueDec: DclNet.getDeclare(),
        };
      case "fs":
        return {
          typeDec: DclFileSystem.getTypeDeclare(),
          valueDec: DclFileSystem.getValueDeclare(),
        };
      case "state":
        return {
          typeDec: DclState.getTypeDeclare(),
          valueDec: DclState.getValueDeclare(),
        };
      case "parser":
        return {
          typeDec: DclParser.getTypeDeclare(),
          valueDec: DclParser.getValueDeclare(),
        };
    }
  };
}
export default ApiDeclarations;
