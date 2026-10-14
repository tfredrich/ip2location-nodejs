[![npm](https://img.shields.io/npm/v/ip2location-nodejs.svg)](http://npm.im/ip2location-nodejs)
[![npm](https://img.shields.io/npm/dm/ip2location-nodejs.svg)](http://npm.im/ip2location-nodejs)

# IP2Location Node.js Module

This Node.js module provides a fast lookup of country, region, city, latitude, longitude, ZIP code, time zone, ISP, domain name, connection type, IDD code, area code, weather station code, station name, mcc, mnc, mobile brand, elevation, usage type, address type, IAB category, district, autonomous system number (ASN) and autonomous system (AS) from IP address by using IP2Location database. This module uses a file based database available at IP2Location.com. This database simply contains IP blocks as keys, and other information such as country, region, city, latitude, longitude, ZIP code, time zone, ISP, domain name, connection type, IDD code, area code, weather station code, station name, mcc, mnc, mobile brand, elevation, usage type, address type, IAB category, district, autonomous system number (ASN), autonomous system (AS), AS domain, AS usage type and AS CIDR as values. It supports both IP address in IPv4 and IPv6.

This module can be used in many types of projects such as:

 - select the geographically closest mirror
 - analyze your web server logs to determine the countries of your visitors
 - credit card fraud detection
 - software export controls
 - display native language and currency 
 - prevent password sharing and abuse of service 
 - geotargeting in advertisement

This module also comes with a middleware to allow querying geolocation data within Express.js.

The database will be updated on a monthly basis for greater accuracy.

The complete database is available at https://www.ip2location.com under Premium subscription package.
The free LITE database is available at https://www.ip2location.com/database/lite.

## Memory-backed BIN lookups

Use the optional memory-backed implementation to load the entire BIN into a Node.js `Buffer`:

```js
const { IP2Location } = require("ip2location-nodejs/src/ip2LocationArray");
const db = new IP2Location();
db.open("/path/to/database.BIN");
console.log(db.getAll("8.8.8.8"));
db.close();
```

It exposes the same exports and synchronous/asynchronous APIs as the default implementation. `open()` / `openAsync()` read the file once; subsequent lookups use only memory, even if the original file is removed. `close()` / `closeAsync()` release the database buffer. Each instance needs enough memory for the entire BIN plus parsed indexes, subject to Node.js buffer-size limits. The default file-backed implementation is unchanged.

### Initialize from bytes (S3, HTTP, or other sources)

`openBuffer(data, options?)` accepts a Node.js `Buffer` or `Uint8Array` directly, without a filename or filesystem access:

```js
// With an AWS SDK v3 GetObject response:
const bytes = await response.Body.transformToByteArray();
if (!db.openBuffer(bytes)) {
    throw new Error("Invalid BIN data");
}
console.log(db.getAll("8.8.8.8"));
db.close();
```

Bytes are copied by default so caller modifications cannot affect lookups. Use `db.openBuffer(bytes, { copy: false })` to share the supplied storage without allocating another database-sized buffer; do not mutate those bytes while the database is open. Uint8Array slices are supported, including nonzero byte offsets.

`openBuffer()` returns `true` on success and `false` when BIN parsing fails. Failed parsing releases partial state and permits retrying. Unsupported input types or a non-boolean `copy` option throw `TypeError`. Like `open()`, initialization is a no-op if the instance is already open (`openBuffer()` returns `true`); call `close()` first to switch databases. Parsing is synchronous, so no separate `openBufferAsync()` is needed. File initialization and buffer initialization share the same metadata/index parser.

Run the self-contained memory-backed checks with `node test/ip2LocationArray.test.js` (no licensed database or API key required).

## Developer Documentation
To learn more about installation, usage, and code examples, please visit the developer documentation at [https://ip2location-nodejs.readthedocs.io/en/latest/index.html.](https://ip2location-nodejs.readthedocs.io/en/latest/index.html)
