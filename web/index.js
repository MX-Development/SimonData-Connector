// @ts-check
import { join } from "path";
import { readFileSync } from "fs";
import express from "express";
import cookieParser from "cookie-parser";
import { Shopify, LATEST_API_VERSION, DataType } from "@shopify/shopify-api";

import applyAuthMiddleware from "./middleware/auth.js";
import verifyRequest from "./middleware/verify-request.js";
import { setupGDPRWebHooks } from "./gdpr.js";
import productCreator from "./helpers/product-creator.js";
import redirectToAuth from "./helpers/redirect-to-auth.js";
import { BillingInterval } from "./helpers/ensure-billing.js";
import { AppInstallations } from "./app_installations.js";

import axios from 'axios';

const USE_ONLINE_TOKENS = false;

const PORT = parseInt(process.env.BACKEND_PORT || process.env.PORT, 10);

// TODO: There should be provided by env vars
const DEV_INDEX_PATH = `${process.cwd()}/frontend/`;
const PROD_INDEX_PATH = `${process.cwd()}/frontend/dist/`;

const DB_PATH = `${process.cwd()}/database.sqlite`; 

// SimonData
const simonDataUrl = 'https://dev.simonsignal.com/events/v1/collect';
const simonDataPartnerId = '965d8693f35e9ad1f64654190b9443334f223a39';
const simonDataPartnerSecret = '817effce84747b6079a86b2a6d62cca118751af6';
const axiosHeaders = {
  'Content-Type': 'application/json',
  'Accept': 'application/json'
}

Shopify.Context.initialize({
  API_KEY: process.env.SHOPIFY_API_KEY,
  API_SECRET_KEY: process.env.SHOPIFY_API_SECRET,
  SCOPES: process.env.SCOPES.split(","),
  HOST_NAME: process.env.HOST.replace(/https?:\/\//, ""),
  HOST_SCHEME: process.env.HOST.split("://")[0],
  API_VERSION: LATEST_API_VERSION,
  IS_EMBEDDED_APP: true,
  // This should be replaced with your preferred storage strategy
  SESSION_STORAGE: new Shopify.Session.SQLiteSessionStorage(DB_PATH),
});

console.log(process.env.SHOPIFY_API_KEY);
console.log(process.env.SHOPIFY_API_SECRET);
console.log(process.env.SCOPES);
console.log(process.env.HOST);
console.log(Shopify.Context.HOST_NAME);
console.log(Shopify.Context.HOST_SCHEME);

const axiosToSimonData = (data) => {
  console.log(`Send data to SimonData via Axios: `, data);
  // return false;
  axios.post(simonDataUrl, data, {
    headers: axiosHeaders
  }) 
  .then((response) => {
    console.log('SimonData response: ', response);
  })
  .catch((error) => {
    console.log('SimonData error: ', error); 
  })
}

// ----------------------------------------------------------------

//              W E B H O O K   H A N D L E R S
 
// ----------------------------------------------------------------
Shopify.Webhooks.Registry.addHandler("CUSTOMERS_CREATE", {
  path: "/api/webhooks",
  webhookHandler: async (_topic, shop, _body) => {
    // Check if handler has fired 
    console.log(`${_topic} called by handler!`, _body);

    // Parse the body string to a JSON object
    const customerData = JSON.parse(_body);

    console.log('Customer data: ', customerData);

    // Create data object to send to SimonData
    var data = {
      "partnerId": simonDataPartnerId,
      "partnerSecret": simonDataPartnerSecret,
      "type": "track",
      "event": "registration",
      "clientId": (customerData.id).toString(),
      "ipAddress": "127.0.0.1",
      "timezone": new Date(customerData.created_at).getTimezoneOffset(),
      "sentAt": new Date(customerData.created_at).valueOf(),
      "properties": {
        "email": customerData.email,
        "username": customerData.first_name + ' ' + customerData.last_name,
        "userId": (customerData.id).toString(),
        "optIn": customerData.marketing_opt_in_level,
        "firstName": customerData.first_name,
        "lastName": customerData.last_name,
        "name": customerData.first_name + ' ' + customerData.last_name
      }
    }
    
    // Axios POST request to SimonData Event Ingestion API
    axiosToSimonData(data);

  }
});


Shopify.Webhooks.Registry.addHandler("APP_UNINSTALLED", {
  path: "/api/webhooks",
  webhookHandler: async (_topic, shop, _body) => {
    await AppInstallations.delete(shop);
  },
});
Shopify.Webhooks.Registry.addHandler("CARTS_UPDATE", {
  path: "/api/webhooks",
  webhookHandler: async (_topic, shop, _body) => {
    // Check if handler has fired
    console.log(`${_topic} called by handler!`, _body);

    // Parse the body string to a JSON object
    const customerData = JSON.parse(_body);

    // Create data object to send to SimonData
    var data = {
      "partnerId": simonDataPartnerId
    }
    
    // Axios POST request to SimonData Event Ingestion API
    axiosToSimonData(data);

  }
});

Shopify.Webhooks.Registry.addHandler("CHECKOUTS_CREATE", {
  path: "/api/webhooks",
  webhookHandler: async (_topic, shop, _body) => {
    // Check if handler has fired
    console.log(`${_topic} called by handler!`, _body);

    // Parse the body string to a JSON object
    const customerData = JSON.parse(_body);

    // Create data object to send to SimonData
    var data = {
      "partnerId": simonDataPartnerId,
      "partnerSecret": simonDataPartnerSecret,
      "type": "track",
      "event": "registration",
      "clientId": customerData.id,
      "ipAddress": "127.0.0.1",
      "timezone": new Date(customerData.created_at).getTimezoneOffset(),
      "sentAt": new Date(customerData.created_at).valueOf(),
      "properties": {
        "email": customerData.email,
        "username": customerData.first_name + ' ' + customerData.last_name,
        "userId": customerData.id,
        "optIn": customerData.marketing_opt_in_level,
        "firstName": customerData.first_name,
        "lastName": customerData.last_name,
        "name": customerData.first_name + ' ' + customerData.last_name
      }
    }
    
    // Axios POST request to SimonData Event Ingestion API
    axiosToSimonData(data);

  }
});

// The transactions with Shopify will always be marked as test transactions, unless NODE_ENV is production.
// See the ensureBilling helper to learn more about billing in this template.
const BILLING_SETTINGS = {
  required: false,
  // This is an example configuration that would do a one-time charge for $5 (only USD is currently supported)
  // chargeName: "My Shopify One-Time Charge",
  // amount: 5.0,
  // currencyCode: "USD",
  // interval: BillingInterval.OneTime,
};

// This sets up the mandatory GDPR webhooks. You’ll need to fill in the endpoint
// in the “GDPR mandatory webhooks” section in the “App setup” tab, and customize
// the code when you store customer data.
//
// More details can be found on shopify.dev:
// https://shopify.dev/apps/webhooks/configuration/mandatory-webhooks
setupGDPRWebHooks("/api/webhooks");

// export for test use only
export async function createServer(
  root = process.cwd(),
  isProd = process.env.NODE_ENV === "production",
  billingSettings = BILLING_SETTINGS
) {
  const app = express();

  app.set("use-online-tokens", USE_ONLINE_TOKENS);
  app.use(cookieParser(Shopify.Context.API_SECRET_KEY));

  applyAuthMiddleware(app, {
    billing: billingSettings,
  });

  // Do not call app.use(express.json()) before processing webhooks with
  // Shopify.Webhooks.Registry.process().
  // See https://github.com/Shopify/shopify-api-node/blob/main/docs/usage/webhooks.md#note-regarding-use-of-body-parsers
  // for more details.
  app.post("/api/webhooks", async (req, res) => {
    try {
      await Shopify.Webhooks.Registry.process(req, res);
      console.log(`Webhook processed, returned status code 200`);
    } catch (e) {
      console.log(`Failed to process webhook: ${e.message}`);
      if (!res.headersSent) {
        res.status(500).send(e.message);
      }
    }
  });

  // app.post("/webhooks/testing", async (req, res) => {
  //   console.log('Posted to webhooks/order-created 1111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111');
  //   try {
  //     await Shopify.Webhooks.Registry.process(req, res);
  //     console.log(`Webhook processed, returned status code 200`);
  //   } catch (e) {
  //     console.log(`Failed to process webhook: ${e.message}`);
  //     if (!res.headersSent) {
  //       res.status(500).send(e.message);
  //     }
  //   }
  // });

  // All endpoints after this point will require an active session
  // app.use(
  //   "/webhooks/*",
  //   verifyRequest(app, {
  //     billing: billingSettings,
  //   })
  // );

  // All endpoints after this point will require an active session
  app.use(
    "/api/*",
    verifyRequest(app, {
      billing: billingSettings,
    })
  );

  app.get("/api/products/count", async (req, res) => {
    const session = await Shopify.Utils.loadCurrentSession(
      req,
      res,
      app.get("use-online-tokens")
    );
    const { Product } = await import(
      `@shopify/shopify-api/dist/rest-resources/${Shopify.Context.API_VERSION}/index.js`
    );

    const countData = await Product.count({ session });
    res.status(200).send(countData);
  });

  app.get("/api/products/create", async (req, res) => {
    const session = await Shopify.Utils.loadCurrentSession(
      req,
      res,
      app.get("use-online-tokens")
    );
    let status = 200;
    let error = null;

    try {
      await productCreator(session);
    } catch (e) {
      console.log(`Failed to process products/create: ${e.message}`);
      status = 500;
      error = e.message;
    }
    res.status(status).send({ success: status === 200, error });
  });


  // ----------------------------------------------------------------

  //              W E B H O O K   H A N D L E R S

  // ----------------------------------------------------------------

  // Get all webhooks
  app.get("/api/get-webhooks", async (req, res) => {

    const session = await Shopify.Utils.loadCurrentSession(
      req,
      res,
      app.get("use-online-tokens")
    );

    if (session) {
      const { Webhook } = await import(
        `@shopify/shopify-api/dist/rest-resources/${Shopify.Context.API_VERSION}/index.js`
      );

      const webhooks = await await Webhook.all({
        session: session,
      });
  
      res.status(200).send(webhooks);
    }
  });

  // Delete all webhooks
  app.get("/api/delete-webhooks", async (req, res) => {

    const session = await Shopify.Utils.loadCurrentSession(
      req,
      res,
      app.get("use-online-tokens")
    );

    if (session) {
      const { Webhook } = await import(
        `@shopify/shopify-api/dist/rest-resources/${Shopify.Context.API_VERSION}/index.js`
      );

      const webhooks = await await Webhook.all({
        session: session,
      });

      if (webhooks.length > 0) {
        webhooks.forEach(async webhook => {
          await Webhook.delete({
            session: session,
            id: webhook.id,
          });
        })
      }
  
      res.status(200).send({ "message": `Webhooks succesfully deleted.` });
    }
  });

  // app.get("/api/create-webhooks", async (req, res) => {

  //   const session = await Shopify.Utils.loadCurrentSession(
  //     req,
  //     res,
  //     app.get("use-online-tokens")
  //   );

  //   if (session) {
  //     const { Webhook } = await import(
  //       `@shopify/shopify-api/dist/rest-resources/${Shopify.Context.API_VERSION}/index.js`
  //     );
  //     const webhook = new Webhook({session: session});
  //     webhook.topic = "orders/create";
  //     webhook.address = `https://${Shopify.Context.HOST_NAME}/api/webhooks/order-created`;
  //     webhook.format = "json";
      
  //     try {
  //       console.log('Address: ', webhook.address);
  //       const savedWebhook = await webhook.save({
  //         update: true,
  //       });
  //       res.status(200).json({ savedWebhook })      
  //     } catch (err) {
  //       console.log(err);   
  //       res.send("Action failed");
  //     }

  //   }

  // });

  // Create all necessary webhooks
  app.get("/api/create-webhooks", async (req, res) => {

    const session = await Shopify.Utils.loadCurrentSession(
      req,
      res,
      app.get("use-online-tokens")
    );

    const necessaryWebhooks = [
      'carts/update',
      'customers/create',
      'checkouts/create',
      'orders/fulfilled',
      'orders/paid',
      'orders/updated',
      'products/update',
      'subscription_contracts/create',
      'subscription_contracts/update'
    ]

    if (session) {
      const { Webhook } = await import(
        `@shopify/shopify-api/dist/rest-resources/${Shopify.Context.API_VERSION}/index.js`
      );

      necessaryWebhooks.forEach(async hook => {
        const webhook = new Webhook({session: session});
        webhook.topic = hook;
        webhook.address = `https://${Shopify.Context.HOST_NAME}/api/webhooks`;
        webhook.format = "json";
         
        try {
          await webhook.save({
            update: true,
          });
          console.log(`Webhook for ${webhook.topic} succesfully created.`);
        } catch (err) {
          console.log(err);   
        }
      })

      res.status(200).send({ "message": `Webhooks succesfully created.` });
    }

  });

  // All endpoints after this point will have access to a request.body
  // attribute, as a result of the express.json() middleware
  app.use(express.json());

  app.use((req, res, next) => {
    const shop = Shopify.Utils.sanitizeShop(req.query.shop);
    if (Shopify.Context.IS_EMBEDDED_APP && shop) {
      res.setHeader(
        "Content-Security-Policy",
        `frame-ancestors https://${encodeURIComponent(
          shop
        )} https://admin.shopify.com;`
      );
    } else {
      res.setHeader("Content-Security-Policy", `frame-ancestors 'none';`);
    }
    next();
  });

  if (isProd) {
    const compression = await import("compression").then(
      ({ default: fn }) => fn
    );
    const serveStatic = await import("serve-static").then(
      ({ default: fn }) => fn
    );
    app.use(compression());
    app.use(serveStatic(PROD_INDEX_PATH, { index: false }));
  }

  app.use("/*", async (req, res, next) => {

    if (typeof req.query.shop !== "string") {
      res.status(500);
      return res.send("No shop provided");
    }

    const shop = Shopify.Utils.sanitizeShop(req.query.shop);
    const appInstalled = await AppInstallations.includes(shop);

    if (!appInstalled) {
      return redirectToAuth(req, res, app);
    }

    if (Shopify.Context.IS_EMBEDDED_APP && req.query.embedded !== "1") {
      const embeddedUrl = Shopify.Utils.getEmbeddedAppUrl(req);

      return res.redirect(embeddedUrl + req.path);
    }

    const htmlFile = join(
      isProd ? PROD_INDEX_PATH : DEV_INDEX_PATH,
      "index.html"
    );

    return res
      .status(200)
      .set("Content-Type", "text/html")
      .send(readFileSync(htmlFile));
  });

  return { app };
}

createServer().then(({ app }) => app.listen(PORT));
