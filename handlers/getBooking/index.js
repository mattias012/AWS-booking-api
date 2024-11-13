const AWS = require('aws-sdk');
const dynamoDb = new AWS.DynamoDB.DocumentClient();

module.exports.handler = async (event) => {
    const bookingId = event.pathParameters.id;
    // Mockup response for fetching a booking by ID
    return {
      statusCode: 200,
      body: JSON.stringify({ message: `Fetched booking with ID: ${bookingId}` }),
    };
  };

