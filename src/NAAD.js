module.exports = (AWS) => {
  const route53 = new AWS.Route53();
  const acm = new AWS.ACM();
  const s3 = new AWS.S3();
  const cloudfront = new AWS.CloudFront();
  return {
    getCertificateIfNotExistCreate: async (domain) => {
      let certificate = null;
      const {
        CertificateSummaryList: certificate_list,
      } = await acm.listCertificates().promise();
      if (certificate_list.length === 0) {
        const DomainName = domain;
        const validationOptions = [{ DomainName, ValidationDomain: domain }];
        certificate = await acm
          .requestCertificate({
            DomainName,
            DomainValidationOptions: validationOptions,
            ValidationMethod: "DNS",
          })
          .promise();
        console.log("wait for created...");
        await new Promise((r) => setTimeout(() => r(true), 5000));
      } else {
        certificate = certificate_list.find((e) => e.DomainName === domain);
      }

      const result = await acm
        .describeCertificate({ CertificateArn: certificate.CertificateArn })
        .promise();
      return result;
    },
    deleteCertificate: async (arn) => {
      return await acm.deleteCertificate({ CertificateArn: arn }).promise();
    },
    getCertificateArn: async (domain) => {
      const {
        CertificateSummaryList: certificate_list,
      } = await acm.listCertificates().promise();
      const certificate = certificate_list.find((e) => e.DomainName === domain);
      return certificate ? certificate.CertificateArn || null : null;
    },
    getRecordType: async (hostedZoneId, Type, Name) => {
      const { ResourceRecordSets } = await route53
        .listResourceRecordSets({ HostedZoneId: hostedZoneId })
        .promise();
      if (Name) {
        return ResourceRecordSets.find(
          (e) => e.Type === Type && e.Name === Name
        );
      } else {
        return ResourceRecordSets.find((e) => e.Type === Type);
      }
    },
    getNameServerList: async (hostedZoneId) => {
      const { ResourceRecordSets } = await route53
        .listResourceRecordSets({ HostedZoneId: hostedZoneId })
        .promise();
      const ns_record = ResourceRecordSets.find(({ Type }) => Type === "NS");
      return ns_record;
    },
    getHostedZones: async () => {
      return await route53.listHostedZones().promise();
    },

    getHostedZoneIfNotExistCreate: async (name) => {
      const { HostedZones } = await route53.listHostedZones().promise();
      if (
        HostedZones.length === 0 ||
        !HostedZones.find(({ Name }) => Name === name)
      ) {
        const { HostedZone } = await route53
          .createHostedZone({
            CallerReference: `${new Date().getTime()}`,
            Name: name,
          })
          .promise();
        return HostedZone;
      } else {
        const HostedZone = HostedZones.find((e) => e.Name === name);
        return HostedZone;
      }
    },
    deleteHostedZone: async (id) => {
      return route53
        .deleteHostedZone({
          Id: id,
        })
        .promise();
    },
    createRecord: async (hostedZoneId, name, value, type) => {
      const { ResourceRecordSets } = await route53
        .listResourceRecordSets({ HostedZoneId: hostedZoneId })
        .promise();
      const exists = ResourceRecordSets.find(
        (e) => e.Type === type && e.Name === name
      );
      if (exists) return "already created";

      return route53
        .changeResourceRecordSets({
          ChangeBatch: {
            Changes: [
              {
                Action: "CREATE",
                ResourceRecordSet: {
                  Name: name,
                  ResourceRecords: [{ Value: value }],
                  Type: type,
                  TTL: 300,
                },
              },
            ],
          },
          HostedZoneId: hostedZoneId,
        })
        .promise();
    },
    deleteRecord: async (id, record) => {
      if (
        !record ||
        !record.Name ||
        !record.TTL ||
        !record.ResourceRecords ||
        !record.ResourceRecords[0] ||
        !record.ResourceRecords[0].Value
        // !record.Type
      ) {
        return null;
      }
      console.log(
        JSON.stringify(
          {
            ChangeBatch: {
              Changes: [
                {
                  Action: "DELETE",
                  ResourceRecordSet: {
                    Name: record.Name,
                    ResourceRecords: [
                      { Value: record.ResourceRecords[0].Value },
                    ],
                    Type: record.Type,
                    TTL: record.TTL,
                  },
                },
              ],
            },
            HostedZoneId: id,
          },
          null,
          2
        )
      );
      return route53
        .changeResourceRecordSets({
          ChangeBatch: {
            Changes: [
              {
                Action: "DELETE",
                ResourceRecordSet: {
                  Name: record.Name,
                  ResourceRecords: [{ Value: record.ResourceRecords[0].Value }],
                  Type: record.Type,
                  TTL: record.TTL,
                },
              },
            ],
          },
          HostedZoneId: id,
        })
        .promise();
    },

    createBucket: async (name) => {
      if (!name) {
        throw new Error(`버킷 name을 입력하세요!`);
      }
      const { Buckets: bucket_list } = await s3.listBuckets().promise();
      if (bucket_list.find((e) => e.Name === name)) {
        return bucket_list.find((e) => e.Name === name);
      } else {
        return await s3.createBucket({ Bucket: name }).promise();
      }
    },
    createDistribution: async (domain) => {
      if (!domain) {
        throw new Error(`domain을 입력하세요!`);
      }
      const {
        DistributionList: { Items: list },
      } = await cloudfront.listDistributions().promise();
      if (
        list.find(
          (e) => e.Origins.Items.DomainName === `${domain}.s3.amazonaws.com`
        )
      ) {
        return list.find(
          (e) => e.Origins.Items.DomainName === `${domain}.s3.amazonaws.com`
        );
      } else {
        const originId = `S3-${domain}`;
        var params = {
          DistributionConfig: {
            CallerReference: originId + "-" + new Date().getTime(),
            Comment: originId,
            DefaultCacheBehavior: {
              ForwardedValues: {
                Cookies: { Forward: "all" },
                QueryString: false,
                Headers: { Quantity: 0 },
                QueryStringCacheKeys: { Quantity: 0 },
              },
              TargetOriginId: originId,
              ViewerProtocolPolicy: "redirect-to-https",
              MinTTL: 3600,
            },
            Enabled: true,
            Origins: {
              Items: [
                {
                  DomainName: `${domain}.s3.amazonaws.com`,
                  Id: originId,
                  S3OriginConfig: { OriginAccessIdentity: "" },
                },
              ],
              Quantity: 1,
            },
            DefaultRootObject: "index.html",
          },
        };
        return cloudfront.createDistribution(params).promise();
      }
    },
  };
};
