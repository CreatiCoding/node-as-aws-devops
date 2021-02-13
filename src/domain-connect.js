const AWS = require("aws-sdk");
AWS.config = new AWS.Config(require("../key.json"));

const DOMAIN = require("../env.json").domain;
const HOSTED_ZONE_NAME = DOMAIN + ".";
const {
  getHostedZones,
  getCertificateArn,
  deleteCertificate,
  getRecordType,
  deleteRecord,
  deleteHostedZone,
  getHostedZoneIfNotExistCreate,
  getNameServerList,
  getCertificateIfNotExistCreate,
  createRecord,
} = require("./NAAD.js")(AWS);

let result = null;
const type = process.argv[2];
(async () => {
  let hostedZoneId = null;

  // 해당 도메인의 DELETE 로직(reset)
  if (type === "delete") {
    // 1. HostedZoneId 가져오기
    const { HostedZones } = await getHostedZones();
    if (HostedZones.length > 0) {
      const { Id: id } = HostedZones.find((e) => e.Name === HOSTED_ZONE_NAME);
      hostedZoneId = id;
      console.log(`hostedZoneId 불러오기: ${hostedZoneId}`);
    } else {
      console.log(`hostedZoneId 없음`);
    }
    // 2. 인증서 지우기
    const certificateArn = await getCertificateArn(DOMAIN);
    if (certificateArn) {
      console.log(`인증서 불러오기: ${certificateArn}`);
      result = await deleteCertificate(certificateArn);
      console.log(`인증서 삭제: ${JSON.stringify(result, null, 2)}`);
    } else {
      console.log(`인증서 없음`);
    }

    // 3. 인증서 인증 record 삭제
    // TODO: certificate의 domain validation CNAME을 가져와야함
    if (hostedZoneId) {
      result = await getRecordType(hostedZoneId, "CNAME");
      console.log(`레코드 CNAME 불러오기:`, result);
      result = await deleteRecord(hostedZoneId, result);
      console.log(`레코드 CNAME 삭제:`, result);
    }

    // 4. HostedZoneId 삭제
    if (hostedZoneId) {
      result = await deleteHostedZone(hostedZoneId);
      console.log(`hostedZoneId 삭제:`, result);
    }
    // 해당 도메인의 READ/CREATE 로직(reset)
  } else {
    // 1. HostedZoneId 가져오기 없으면 만들기
    ({ Id: hostedZoneId } = await getHostedZoneIfNotExistCreate(
      HOSTED_ZONE_NAME
    ));
    console.log(`01. hostedZoneId 불러오기: ${hostedZoneId}\n`);

    // 2. 네임서버 불러오기
    const { ResourceRecords: record_list } = await getNameServerList(
      hostedZoneId
    );
    console.log(`02. 인증서 발급시 네임서버 등록 필요!`);
    console.log(`-----------------------------------`);
    console.log(`${record_list.map((e) => e.Value).join("\n")}`);
    console.log(`-----------------------------------\n`);

    // 3. 인증서 불러오기 없으면 만들기
    console.log(`03. 인증서 발급 후, 도메인 검증 등록`);
    console.log(`-----------------------------------`);
    const { Certificate } = await getCertificateIfNotExistCreate(DOMAIN);
    console.log({
      CertificateArn: Certificate.CertificateArn,
      DomainName: Certificate.DomainName,
      Status: Certificate.Status,
    });
    console.log(`-----------------------------------`);
    const { DomainValidationOptions } = Certificate;
    const { ResourceRecord } = DomainValidationOptions[0];
    result = await getRecordType(
      hostedZoneId,
      ResourceRecord.Type,
      ResourceRecord.Name
    );
    if (!result) {
      await new Promise((resolve) => {
        const time_id = setInterval(async () => {
          result = await getRecordType(
            hostedZoneId,
            ResourceRecord.Type,
            ResourceRecord.Name
          );
          if (result) {
            clearInterval(time_id);
            return resolve();
          }
          await createRecord(
            hostedZoneId,
            ResourceRecord.Name,
            ResourceRecord.Value,
            ResourceRecord.Type
          );
          console.log("wait for created...");
        }, 5000);
      });
    }
    result = await getCertificateIfNotExistCreate(DOMAIN);
    console.log({
      CertificateArn: Certificate.CertificateArn,
      DomainName: Certificate.DomainName,
      Status: Certificate.Status,
    });
    console.log(`-----------------------------------\n`);
    console.log("인증서 발급을 위한 Record 생성 완료\n");
  }
})();
