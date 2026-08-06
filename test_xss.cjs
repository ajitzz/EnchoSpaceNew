const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');
const anchor = "app.use(hpp());";
if (code.includes(anchor)) {
    console.log("HPP exists");
} else {
    console.log("HPP MISSING");
}

const req_limiter = "const apiLimiter = rateLimit({";
if (code.includes(req_limiter)) {
    console.log("Rate limiter exists");
} else {
    console.log("Rate limiter MISSING");
}
