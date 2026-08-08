function aggregateError() {
  const error = new Error("Upload request exceeds the aggregate size limit");
  error.statusCode = 413;
  error.code = "UPLOAD_AGGREGATE_TOO_LARGE";
  return error;
}

export function createAggregateMemoryStorage(maxAggregateBytes) {
  return {
    _handleFile(req, file, callback) {
      req.uploadIncomingBytes ||= 0;
      const chunks = [];
      let size = 0;
      let finished = false;

      const fail = () => {
        if (finished) return;
        finished = true;
        file.stream.removeListener("data", onData);
        file.stream.resume();
        callback(aggregateError());
      };
      const onData = (chunk) => {
        req.uploadIncomingBytes += chunk.length;
        if (req.uploadIncomingBytes > maxAggregateBytes) return fail();
        size += chunk.length;
        chunks.push(chunk);
      };
      file.stream.on("data", onData);
      file.stream.once("error", (error) => {
        if (!finished) { finished = true; callback(error); }
      });
      file.stream.once("end", () => {
        if (!finished) { finished = true; callback(null, { buffer: Buffer.concat(chunks, size), size }); }
      });
    },
    _removeFile(_req, file, callback) {
      delete file.buffer;
      callback(null);
    },
  };
}
