import mongoose from "mongoose";
const Schema = mongoose.Schema;
let Session = new Schema({
    session_id: {
        type: String
    },
    cart_token: {
        type: String
    },
    session_token: {
        type: String
    },
    customer_id: {
        type: String
    },
    customer_email: {
        type: String
    },
    order_id: {
        type: String
    },
    date_created: {
        type: Date
    },
    date_updated: {
        type: Date
    }
});

export default mongoose.model('Session', Session);