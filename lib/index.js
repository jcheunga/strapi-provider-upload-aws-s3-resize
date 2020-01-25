"use strict";

/**
 * Module dependencies
 */

// Public node modules.
const sharp = require("sharp");
const AWS = require("aws-sdk");

const trimParam = str => (typeof str === "string" ? str.trim() : undefined);

module.exports = {
  provider: "aws-s3-resize",
  name: "AWS S3 / Wasabi upload resize",
  auth: {
    setStorageProvider: {
      label: "Set storage provider",
      type: "enum",
      values: ["AWS", "Wasabi"]
    },
    region: {
      label: "Region",
      type: "enum",
      values: [
        "us-east-1",
        "us-east-2",
        "us-west-1",
        "us-west-2",
        "ca-central-1",
        "ap-south-1",
        "ap-northeast-1",
        "ap-northeast-2",
        "ap-northeast-3",
        "ap-southeast-1",
        "ap-southeast-2",
        "cn-north-1",
        "cn-northwest-1",
        "eu-central-1",
        "eu-north-1",
        "eu-west-1",
        "eu-west-2",
        "eu-west-3",
        "sa-east-1"
      ]
    },
    baseUrl: {
      label: "Base URL, e.g. https://example.com",
      type: "text"
    },
    bucket: {
      label: "Bucket",
      type: "text"
    },
    prefix: {
      label: "Key Prefix, e.g. uploads/",
      type: "text"
    },
    setObjectPublic: {
      label: "Set the object public accessible? ACL = public-read",
      type: "enum",
      values: ["Public", "No Public"]
    }
  },
  init: config => {
    AWS.config.update({
      accessKeyId: trimParam(config.strapi.storageAccessKey),
      secretAccessKey: trimParam(config.strapi.storageSecretKey),
      region: config.region
    });

    const s3Config = {
      params: {
        Bucket: trimParam(config.bucket)
      }
		};

		const endpoint = `s3.${config.bucket}.wasabisys.com`;
		const baseUrl = config.baseUrl || `https://${endpoint}`;

    if (config.setStorageProvider === "Wasabi") {
      s3Config["endpoint"] = new AWS.Endpoint(
        endpoint
      );
    }

    const S3 = new AWS.S3(s3Config);

    return {
      upload: file => {
        return new Promise((resolve, reject) => {
					const prefix = config.prefix.trim() === "/" ? "" : config.prefix.trim();
					const path = file.path ? `${file.path}/` : "";
					const objectKey = (variant) => `${prefix}${path}${file.hash}_${variant}.jpg`;
					const image = sharp(new Buffer(file.buffer, "binary"));

          function resizeAndUpload(variant, width, quality) {
            return image
              .clone()
              .resize({ width: width })
              .jpeg({
                quality: quality || 60,
                progressive: true,
                optimiseScans: true
              })
              .toBuffer()
              .then(async data => {
                await S3.upload(
                  Object.assign(
                    {
                      Key: objectKey,
                      Body: data,
                      ContentType: "image/jpeg"
                    },
                    config.setObjectPublic === "Public"
                      ? { ACL: "public-read" }
                      : {}
                  )
                ).promise();

                file[variant] = `${baseUrl}/${objectKey(variant)}`;
              });
          }

          resizeAndUpload(image, "url", 1920, 80)
            .then(() => {
              return resizeAndUpload(image, "thumb", 400, 60);
            })
            .then(() => {
              return resolve();
            })
            .catch(err => {
              return reject(err);
            });
        });
      },
      delete: file => {
        return new Promise((resolve, reject) => {
					const prefix = config.prefix.trim() === "/" ? "" : config.prefix.trim();
					const path = file.path ? `${file.path}/` : "";
					const objectKey = (variant) => `${prefix}${path}${file.hash}_${variant}.jpg`;

          async function deleteImage(variant) {
            return await S3.deleteObject({
              Key: objectKey(variant)
            }).promise();
					}

          deleteImage("url")
            .then(() => {
              return deleteImage("thumb");
            })
            .then(() => {
              return resolve();
            })
            .catch(err => {
              return reject(err);
            });
        });
      }
    };
  }
};
