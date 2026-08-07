const { readFileSync } = require('fs');
// Can't really read container stdout easily unless it writes to a file. Let's modify patch_trace to write the error to a file.
