// Import necessary AWS SDK v3 modules
const { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");

// Initialize DynamoDB client with the specified AWS region
const dynamoDbClient = new DynamoDBClient({ region: process.env.REGION });

module.exports.handler = async (event) => {
  try {
    // Extract query parameters
    const { roomType, startDate, endDate } = event.queryStringParameters;

    // Validate input
    if (!roomType || !startDate || !endDate) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Missing required query parameters: roomType, startDate, endDate" }),
      };
    }

    // Query parameters for DynamoDB
    const params = {
      TableName: process.env.DYNAMODB_ROOMS_AVAILABILITY_TABLE,
      KeyConditionExpression: "roomType = :roomType AND #date BETWEEN :startDate AND :endDate",
      ExpressionAttributeValues: {
        ":roomType": { S: roomType },
        ":startDate": { S: startDate },
        ":endDate": { S: endDate },
      },
      ExpressionAttributeNames: {
        "#date": "date", // Use ExpressionAttributeNames for reserved keywords like 'date'
      },
    };

    // Execute the query using DynamoDBClient
    const result = await dynamoDbClient.send(new QueryCommand(params));

    // Return the result
    return {
      statusCode: 200,
      body: JSON.stringify(result.Items),
    };
  } catch (error) {
    console.error("Error fetching available rooms:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal server error", error: error.message }),
    };
  }
};
