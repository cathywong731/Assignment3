require("dotenv").config();
const mongoose = require("mongoose");
const Sequelize = require("sequelize");

function connectMongoDB() {
  return mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => console.log("MongoDB Connected"))
    .catch((err) => console.log(err));
};  

// set up sequelize to point to our postgres database
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: "postgres",
  dialectOptions: {
    ssl: {
      require: true, // This will help you connect to the database with SSL
      rejectUnauthorized: false, // Allows self-signed certificates
    },
  },
  logging: false                
});

// This will not throw an error, both instances will be created
function connectPostgres() {
  return sequelize.authenticate()
    .then(() => {
      console.log("PostgreSQL Connected");
      return sequelize.sync({ alter: true }); //return the promise from sync to ensure it completes before proceeding
    })
    .then(() => { console.log("PostgreSQL Tables Synced"); })
    .catch((err) => console.log(err));
}


 module.exports = { connectMongoDB, connectPostgres, sequelize } ;
