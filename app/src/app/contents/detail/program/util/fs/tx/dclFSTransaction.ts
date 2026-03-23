import RuntimeUtil from "../../../runtime/runtimeUtil";
import DeleteFile from "./deleteFile";
import RenameFile from "./renameFile";
import SaveFile from "./saveFile";
import UpdateFile from "./updateFile";
import OpenText from "./openText";
import CopyFile from "./copyFile";

namespace DclFSTransaction {

    export type TransactionAPI = {
        openText: (filePath: string, encorde: "utf8" | "sjis") => Promise<{ token: RuntimeUtil.FileToken; content: string; }>;
        saveText: (filePath: string, content: string) => void;
        updateText: (token: RuntimeUtil.FileToken, content: string) => void;
        copyFile: (from: string, dest: string) => void;
        deleteFile: (filePath: string) => void;
        deleteFileByToken: (token: RuntimeUtil.FileToken) => void;
        renameFile: (targetFilePath: string, newFileName: string) => void;
        renameFileByToken: (token: RuntimeUtil.FileToken, newName: string) => void;
    }

    export const getObject = (vfs: RuntimeUtil.VFSState): TransactionAPI => {

        return {
            openText: (filePath: string, encoding: "utf8" | "sjis") => {
                return OpenText.execute(vfs, filePath, encoding);
            },
            saveText: (filePath: string, content: string) => {
                return SaveFile.execute(vfs, filePath, content);
            },
            updateText: (token: RuntimeUtil.FileToken, content: string) => {
                UpdateFile.execute(vfs, token, content);
            },
            copyFile: (from: string, dest: string) => {
                CopyFile.execute(vfs, from, dest);
            },
            deleteFile: (filePath: string) => {
                DeleteFile.executeByPath(vfs, filePath);
            },
            deleteFileByToken: (token: RuntimeUtil.FileToken) => {

                DeleteFile.executeByToken(vfs, token);
            },
            renameFile: (fileFilePath: string, newFileName: string) => {
                RenameFile.executeByPath(vfs, fileFilePath, newFileName);
            },
            renameFileByToken: (token: RuntimeUtil.FileToken, newName: string) => {
                RenameFile.executeByToken(vfs, token, newName);
            },
        }
    };
};
export default DclFSTransaction;