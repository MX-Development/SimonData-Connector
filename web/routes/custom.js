export default function customRoutes() {
  app.post("/back-in-stock", async (req, res) => {
    console.log('Back in stock data: ', req.body);
    res.status(200).send({ "message": `Back in stock data success` });
  });
}