namespace NativeIoPolicy {
  const ownedCommands = new Set([
    'run_process',
    'load_http',
    'load_html_from_url',
    'scan_directory',
    'exists_path',
    'glob_path',
    'read_binary',
    'read_file',
    'read_tail_file',
    'read_dir',
    'stat',
    'save_text',
    'save_binary',
    'rename',
    'copy_file',
    'make_dir',
    'delete_file',
    'delete_dir',
    'delete_dir_all',
  ]);

  export const isOwnedCommand = (command: string) => ownedCommands.has(command);
}
export default NativeIoPolicy;
