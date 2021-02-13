const AWS = require("aws-sdk");
AWS.config = new AWS.Config(require("../key.json"));
const DOMAIN = require("../env.json").domain;

const { createBucket, createDistribution } = require("./NAAD.js")(AWS);
const type = process.argv[2];
let result = null;

(async () => {
  // 해당 도메인의 DELETE 로직(reset)
  if (type === "delete") {
    console.log("\x1b[31m", "호스팅 지우기는 아직 미지원입니다.", "\x1b[0m");
  } else {
    console.log("\x1b[32m", "01. S3 Bucket 만들기", "\x1b[0m");
    result = await createBucket(DOMAIN);
    console.log(result);
    console.log();

    console.log("\x1b[32m", "02. cloudfront 만들기", "\x1b[0m");
    result = await createDistribution(DOMAIN);
    console.log(
      "Distribution ID:",
      "\x1b[36m",
      result.Distribution.Id,
      "\x1b[0m"
    );
    console.log(
      "Distribution ARN:",
      "\x1b[36m",
      result.Distribution.ARN,
      "\x1b[0m"
    );
    console.log();
  }
})();
