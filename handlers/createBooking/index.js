const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');  // Import for ID generation
const dynamoDb = new AWS.DynamoDB.DocumentClient();

module.exports.handler = async (event) => {
  const { guestName, roomType, nights } = JSON.parse(event.body);
  const bookingId = uuidv4();  //Unique ID for booking

  const params = {
    TableName: process.env.DYNAMODB_TABLE_NAME,
    Item: {
      bookingId,               
      guestName,              
      roomType,                
      nights,                  
      createdAt: new Date().toISOString(),
    },
  };

  try {
    await dynamoDb.put(params).promise();
    return {
      statusCode: 201,
      body: JSON.stringify({ message: "Booking created successfully!", bookingId }),
    };
  } catch (error) {
    console.error("Error creating booking:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Could not create booking" }),
    };
  }
};
