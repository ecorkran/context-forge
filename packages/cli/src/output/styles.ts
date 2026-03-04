import chalk from 'chalk';

/** Style for field labels (e.g. "Project:", "Phase:") */
export const label = chalk.bold;

/** Style for field values */
export const value = chalk.cyan;

/** Style for section headings */
export const heading = chalk.bold.underline;

/** Style for secondary/subdued text */
export const dim = chalk.dim;

/** Style for error messages */
export const error = chalk.red;

/** Style for success messages */
export const success = chalk.green;
