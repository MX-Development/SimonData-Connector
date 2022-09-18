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

import customRoutes from './routes/custom.js';

import axios from 'axios';

const USE_ONLINE_TOKENS = false;

const PORT = parseInt(process.env.BACKEND_PORT || process.env.PORT, 10);

// TODO: There should be provided by env vars
const DEV_INDEX_PATH = `${process.cwd()}/frontend/`;
const PROD_INDEX_PATH = `${process.cwd()}/frontend/dist/`;

const DB_PATH = `${process.cwd()}/database.sqlite`; 

// SimonData
const simonDataUrl = 'https://simonsignal.com/http/v1/collect';
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

console.log('SimonData Connector active on URL: ', process.env.HOST);

const axiosToSimonData = async (data) => {
  return false;
  try {
    const result = await axios.post(simonDataUrl, data, {
      headers: axiosHeaders
    }) 
    .then((response) => {
      console.log('SimonData response: ', response);
      return response;
    })
    .catch((error) => {
      console.log('SimonData error: ', error); 
    })

    if (result) {
      return true;
    }
  } catch (err) {
    return false;
  }
}

const sendOrderedProducts = (body, products) => {
  products.forEach(product => {

    // Create data object to send to SimonData
    var data = {
      "partnerId": simonDataPartnerId,
      "partnerSecret": simonDataPartnerSecret,
      "type": "track",
      "event": "custom",
      "clientId": "test123456abcdef",
      "timezone": new Date(body.created_at).getTimezoneOffset(),
      "sentAt": new Date(body.created_at).valueOf(),
      "properties": {
          "eventName": "ordered_product",
          "requiresIdentity": false
      },
      "traits": {
          "orderId": body.id,
          "product": product
      }
    }
    
    // Axios POST request to SimonData Event Ingestion API
    axiosToSimonData(data);
  })
}

const sendRevenue = (body) => {

  // Create data object to send to SimonData
  var data = {
    "partnerId": simonDataPartnerId,
    "partnerSecret": simonDataPartnerSecret,
    "type": "track",
    "event": "custom",
    "clientId": "test123456abcdef",
    "timezone": new Date(body.created_at).getTimezoneOffset(),
    "sentAt": new Date(body.created_at).valueOf(),
    "properties": {
        "eventName": "revenue",
        "requiresIdentity": false
    },
    "traits": {
        "orderId": body.id,
        "revenue": body.total_price
    }
  }
  
  // Axios POST request to SimonData Event Ingestion API
  axiosToSimonData(data);
}

Shopify.Webhooks.Registry.addHandler("APP_UNINSTALLED", {
  path: "/api/webhooks",
  webhookHandler: async (_topic, shop, _body) => {
    await AppInstallations.delete(shop);
  },
}); 
 
// ----------------------------------------------------------------

//              W E B H O O K   H A N D L E R S
 
// ----------------------------------------------------------------
Shopify.Webhooks.Registry.addHandler("CUSTOMERS_CREATE", {
  path: "/api/webhooks",
  webhookHandler: async (_topic, shop, _body) => {
    // Check if handler has fired
    console.log(`Handler topic: `, _topic);

    // Parse the body string to a JSON object
    const body = JSON.parse(_body);

    // No IP address: https://community.shopify.com/c/shopify-apis-and-sdks/customers-create-webhook-get-customer-ip/td-p/569982

    // Create data object to send to SimonData
    var data = {
      "partnerId": simonDataPartnerId,
      "partnerSecret": simonDataPartnerSecret,
      "type": "track",
      "event": "registration",
      "clientId": "test123456abcdef",
      "timezone": new Date(body.created_at).getTimezoneOffset(),
      "sentAt": new Date(body.created_at).valueOf(),
      "properties": {
        "email": body.email,
        "userId": body.id,
        "optIn": body.marketing_opt_in_level,
        "firstName": body.first_name,
        "lastName": body.last_name,
        "name": body.first_name + ' ' + body.last_name
      }
    }
    
    // Axios POST request to SimonData Event Ingestion API
    axiosToSimonData(data);

  }
});

Shopify.Webhooks.Registry.addHandler("CHECKOUTS_CREATE", {
  path: "/api/webhooks",
  webhookHandler: async (_topic, shop, _body) => {
    // Check if handler has fired
    console.log(`Handler topic: `, _topic);

    // Parse the body string to a JSON object 
    const body = JSON.parse(_body);

    // Create data object to send to SimonData
    var data = {
      "partnerId": simonDataPartnerId,
      "partnerSecret": simonDataPartnerSecret,
      "type": "track",
      "event": "custom",
      "clientId": "test123456abcdef",
      "timezone": new Date(body.created_at).getTimezoneOffset(),
      "sentAt": new Date(body.created_at).valueOf(),
      "properties": {
           "eventName": "checkout_created",
           "requiresIdentity": false
      },
      "traits": {
        "email": body.email,
        "userId": body.id,
        "firstName": body.first_name,
        "lastName": body.last_name,
        "name": body.first_name + ' ' + body.last_name
      }
    }
    
    // Axios POST request to SimonData Event Ingestion API
    axiosToSimonData(data);

  }
});

Shopify.Webhooks.Registry.addHandler("ORDERS_PAID", { 
  path: "/api/webhooks",
  webhookHandler: async (_topic, shop, _body) => {
    // Check if handler has fired
    console.log(`Handler topic: `, _topic);

    // Parse the body string to a JSON object
    const body = JSON.parse(_body);

    const lineItems = [];
    (body.line_items).forEach(item => {
      const product = {
        "productId": item.product_id,
        "variant": item.variant_id,
        "sku": item.sku,
        "productName": item.title,
        "price": item.price,
        "quantity": item.quantity
      }

      lineItems.push(product);
    })

    sendOrderedProducts(body, lineItems);

    sendRevenue(body);

    // Create data object to send to SimonData
    var data = {
      "partnerId": simonDataPartnerId,
      "partnerSecret": simonDataPartnerSecret,
      "type": "track",
      "event": "complete_transaction",
      "clientId": "test123456abcdef",
      "ipAddress": body.browser_ip,
      "timezone": new Date(body.created_at).getTimezoneOffset(),
      "sentAt": new Date(body.created_at).valueOf(),
      "properties": {
           "eventName": "placed_order",
           "requiresIdentity": false
      },
      "traits": {
          "userId": body.user_id,
          "cartItems": lineItems,
          "transactionId": body.checkout_id,
          "revenue": body.total_price
      },
      "userId": body.user_id,
    }
    
    // Axios POST request to SimonData Event Ingestion API
    axiosToSimonData(data);

  }
});

Shopify.Webhooks.Registry.addHandler("ORDERS_FULFILLED", {
  path: "/api/webhooks",
  webhookHandler: async (_topic, shop, _body) => {
    // Check if handler has fired
    console.log(`Handler topic: `, _topic);

    // Parse the body string to a JSON object
    const body = JSON.parse(_body);

    const lineItems = [];
    (body.line_items).forEach(item => {
      const product = {
        "productId": item.product_id,
        "variant": item.variant_id,
        "productName": item.title,
        "price": item.price,
        "quantity": item.quantity
      }

      lineItems.push(product);
    })

    var data = {
      "partnerId": simonDataPartnerId,
      "partnerSecret": simonDataPartnerSecret,
      "type": "track",
      "event": "custom",
      "clientId": "test123456abcdef",
      "timezone": new Date(body.created_at).getTimezoneOffset(),
      "sentAt": new Date(body.created_at).valueOf(),
      "properties": {
           "eventName": "fulfilled_order",
           "requiresIdentity": false
      },
      "traits": {
        "email": body.email,
        "userId": body.user_id,
        "properties": {
            "cartItems": lineItems,
            "transactionId": body.checkout_id,
            "revenue": body.total_price
        }
      }
    }
    
    // Axios POST request to SimonData Event Ingestion API
    axiosToSimonData(data);

  }
});

Shopify.Webhooks.Registry.addHandler("REFUNDS_CREATE", {
  path: "/api/webhooks",
  webhookHandler: async (_topic, shop, _body) => {
    // Check if handler has fired
    console.log(`Handler topic: `, _topic);

    // Parse the body string to a JSON object
    const body = JSON.parse(_body);

    const lineItems = [];
    (body.refund_line_items).forEach(item => {
      const product = {
        "productId": item.product_id,
        "variant": item.variant_id,
        "productName": item.title,
        "price": item.price,
        "quantity": item.quantity
      }

      lineItems.push(product);
    })

    var data = {
      "partnerId": simonDataPartnerId,
      "partnerSecret": simonDataPartnerSecret,
      "type": "track",
      "event": "custom",
      "clientId": "test123456abcdef",
      "timezone": new Date(body.created_at).getTimezoneOffset(),
      "sentAt": new Date(body.created_at).valueOf(),
      "properties": {
           "eventName": "refunded_order",
           "requiresIdentity": false
      },
      "traits": {
        "userId": body.user_id,
        "orderId": body.order_id,
        "properties": {
            "refundItems": lineItems
        }
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

  app.use("/api/custom/*", express.json());

  app.post("/api/custom/back-in-stock", async (req, res) => {

    console.log('Body: ', req.body);

    // Create data object to send to SimonData
    var data = {
      "partnerId": simonDataPartnerId,
      "partnerSecret": simonDataPartnerSecret,
      "type": "track",
      "event": "custom",
      "clientId": "test123456abcdef",
      // "timezone": new Date(body.created_at).getTimezoneOffset(),
      // "sentAt": new Date(body.created_at).valueOf(),
      "properties": {
           "eventName": "back_in_stock",
           "requiresIdentity": false
      },
      "traits": {
        "email": req.body.email,
        "productID": req.body.variant
      }
    }
    
    // Axios POST request to SimonData Event Ingestion API
    const result = await axiosToSimonData(data);

    if (result) {
      res.status(200).send({
        "result": "success"
      });
    } else {
      res.status(500).send({
        "result": "failed"
      });
    }

  });

  app.post("/api/custom/simon-data/product-viewed", async (req, res) => {

    // Create data object to send to SimonData
    var data = {
      "partnerId": simonDataPartnerId,
      "partnerSecret": simonDataPartnerSecret,
      "event": "product_view",
      "type": "track",
      "clientId": "test123456abcdef",
      "sentAt": new Date().valueOf(),
      "properties": {
          "productId": req.body.productId,
          "productName": req.body.title,
          "price": req.body.price,
          "customerId": req.body.customerId ? req.body.customerId : ''
      }
    }
    
    // Axios POST request to SimonData Event Ingestion API
    const result = await axiosToSimonData(data);

    if (result) {
      res.status(200).send({
        "result": "success"
      });
    } else {
      res.status(500).send({
        "result": "failed"
      });
    }

  });

  app.post("/api/custom/recharge/webhooks/created", async (req, res) => {
    console.log('Recharge created webhook successfully called.');

    // Create data object to send to SimonData
    var data = {
      "partnerId": simonDataPartnerId,
      "partnerSecret": simonDataPartnerSecret,
      "type": "track",
      "event": "custom",
      "clientId": "test123456abcdef",
      // "timezone": new Date(body.created_at).getTimezoneOffset(),
      // "sentAt": new Date(body.created_at).valueOf(),
      "properties": {
           "eventName": "subscription_created",
           "requiresIdentity": false
      },
      "traits": {}
    }
    
    // Axios POST request to SimonData Event Ingestion API
    const result = await axiosToSimonData(data);

    if (result) {
      res.status(200).send({
        "result": "success"
      });
    } else {
      res.status(200).send({
        "result": "failed"
      });
    }

  });

  app.post("/api/custom/recharge/webhooks/cancelled", async (req, res) => {
    console.log('Recharge cancelled webhook successfully called.');

    // Create data object to send to SimonData
    var data = {
      "partnerId": simonDataPartnerId,
      "partnerSecret": simonDataPartnerSecret,
      "type": "track",
      "event": "custom",
      "clientId": "test123456abcdef",
      // "timezone": new Date(body.created_at).getTimezoneOffset(),
      // "sentAt": new Date(body.created_at).valueOf(),
      "properties": {
           "eventName": "subscription_cancelled",
           "requiresIdentity": false
      },
      "traits": {}
    }
    
    // Axios POST request to SimonData Event Ingestion API
    const result = await axiosToSimonData(data);

    if (result) {
      res.status(200).send({
        "result": "success"
      });
    } else {
      res.status(200).send({
        "result": "failed"
      });
    }

  });

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

  app.get("/api/get-events", async (req, res) => {

    const session = await Shopify.Utils.loadCurrentSession(
      req,
      res,
      app.get("use-online-tokens")
    );

    if (session) {
      const { Event } = await import(
        `@shopify/shopify-api/dist/rest-resources/${Shopify.Context.API_VERSION}/index.js`
      );

      const events = await Event.all({
        session: session,
      });
  
      res.status(200).send(events);
    }
  });

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
      'app/uninstalled',
      'customers/create',
      'checkouts/create',
      'orders/paid',
      'orders/fulfilled',
      'refunds/create'
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

  // ----------------------------------------------------------

  //               C U S T O M   R O U T E S

  // ----------------------------------------------------------

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

  app.use("/api/*", async (req, res, next) => {

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

  app.use("/", async (req, res, next) => {

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
