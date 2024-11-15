// Import necessary AWS SDK commands for DynamoDB, using v3 version
const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");

// Initialize DynamoDB client with the AWS region from environment variables
const dynamoDbClient = new DynamoDBClient({ region: process.env.REGION });

// Main handler function that processes the get booking request
module.exports.handler = async (event) => {
  // Log incoming event and environment variables for debugging
  console.log('Event received:', JSON.stringify(event, null, 2));
  console.log('Environment variables:', {
    REGION: process.env.REGION,
    TABLE: process.env.DYNAMODB_BOOKINGS_TABLE
  });

  // Get the booking ID from the path parameters in the request URL
  const bookingId = event.pathParameters.id;

  try {
    // Set up parameters to get booking from DynamoDB
    const params = {
      TableName: process.env.DYNAMODB_BOOKINGS_TABLE,
      Key: {
        bookingId: { S: bookingId }
      }
    };

    // Log the parameters we're using to find the booking
    console.log('DynamoDB params:', JSON.stringify(params, null, 2));

    // Send request to DynamoDB to get the booking
    const result = await dynamoDbClient.send(new GetItemCommand(params));
    console.log('DynamoDB result:', JSON.stringify(result, null, 2));

    // If no booking was found with this ID, return a 404 error
    if (!result.Item) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          message: `No booking found with ID: ${bookingId}`
        })
      };
    }

    // Convert the DynamoDB format to a normal JavaScript object
    const booking = {
      bookingId: result.Item.bookingId.S,
      guestName: result.Item.guestName.S,
      email: result.Item.email.S,
      guestCount: result.Item.guestCount.N ? Number(result.Item.guestCount.N) : null,  // Changed from .S to .N
      roomType: result.Item.roomType.S,
      roomCount: result.Item.roomCount.N ? Number(result.Item.roomCount.N) : null,  // Consistent naming with update function
      checkInDate: result.Item.checkInDate.S,
      checkOutDate: result.Item.checkOutDate.S,
      createdAt: result.Item.createdAt.S
    };

    // Add debug logging
    console.log('Raw DynamoDB Item:', JSON.stringify(result.Item, null, 2));
    console.log('Converted booking:', JSON.stringify(booking, null, 2));

    // Return the booking data with a success status code
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(booking)
    };

  } catch (error) {
    // If something goes wrong, log the error and return a 500 error response
    console.error('Error fetching booking:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        message: 'Could not fetch booking details',
        error: error.message
      })
    };
  }
};