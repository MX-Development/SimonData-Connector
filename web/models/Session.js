import mongoose from "mongoose";
const Schema = mongoose.Schema;
let Session = new Schema({
    session_id: {
        type: String
    },
    cart_token: {
        type: String
    },
    customer_id: {
        type: String
    }
});

module.exports = mongoose.model('Session', Session);