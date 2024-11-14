const AWS = require('aws-sdk');
const dynamoDb = new AWS.DynamoDB.DocumentClient();

module.exports.handler = async (event) => {
  const { roomType, startDate, endDate } = event.queryStringParameters || {};

  // Kontrollera att alla nödvändiga parametrar finns
  if (!roomType || !startDate || !endDate) {
    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ error: "roomType, startDate, and endDate query parameters are required" }),
    };
  }

  const params = {
    TableName: process.env.DYNAMODB_BOOKINGS_TABLE,
    IndexName: 'RoomTypeIndex',
    KeyConditionExpression: 'roomType = :roomType AND checkInDate BETWEEN :startDate AND :endDate',
    ExpressionAttributeValues: {
      ':roomType': roomType,
      ':startDate': startDate,
      ':endDate': endDate,
    }
  };

  try {
    const data = await dynamoDb.query(params).promise();
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data.Items),
    };
  } catch (error) {
    console.error("Error fetching bookings:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ error: "Could not retrieve bookings", details: error.message }),
    };
  }
};
