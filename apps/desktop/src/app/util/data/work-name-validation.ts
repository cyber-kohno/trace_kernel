export const validateWorkName = (
  name: string,
  existingNames: readonly string[],
  excludeIndex?: number,
): { code: string; message: string }[] => {
  const errors = [];
  if (name === '')
    errors.push({
      code: 'INVALID_NAME',
      message: 'Work name must not be empty.',
    });
  if (
    existingNames.some(
      (existing, index) => index !== excludeIndex && existing === name,
    )
  ) {
    errors.push({
      code: 'DUPLICATE_NAME',
      message: `Work '${name}' already exists.`,
    });
  }
  return errors;
};
