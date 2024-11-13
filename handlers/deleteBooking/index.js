// Import DynamoDB commands from AWS SDK v3
const { DynamoDBClient, GetItemCommand, DeleteItemCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const dynamoDbClient = new DynamoDBClient({ region: process.env.REGION });

// Main handler for deleting a booking with cancellation conditions
module.exports.handler = async (event) => {
  const bookingId = event.pathParameters.id;

  try {
    // Fetch the booking details to check cancellation conditions
    const getBookingParams = {
      TableName: process.env.DYNAMODB_BOOKINGS_TABLE,
      Key: { bookingId: { S: bookingId } },
    };
    const bookingData = await dynamoDbClient.send(new GetItemCommand(getBookingParams));

    // If the booking doesn't exist, return a 404 error
    if (!bookingData.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Booking not found." }),
      };
    }

    // Extract booking details
    const { checkInDate, checkOutDate, roomType, roomCount } = bookingData.Item;
    const today = new Date();
    const checkIn = new Date(checkInDate.S);
    const daysUntilCheckIn = Math.ceil((checkIn - today) / (1000 * 60 * 60 * 24));

    // Check if cancellation is within allowed period (at least 2 days before check-in)
    if (daysUntilCheckIn < 2) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Booking cannot be canceled less than 2 days before check-in." }),
      };
    }

    // Step 1: Delete the booking record from DYNAMODB_BOOKINGS_TABLE
    const deleteBookingParams = {
      TableName: process.env.DYNAMODB_BOOKINGS_TABLE,
      Key: { bookingId: { S: bookingId } },
    };
    await dynamoDbClient.send(new DeleteItemCommand(deleteBookingParams));

    // Step 2: Update room availability for each day of the booking period
    // First create a promise array to store all update commands
    const updateAvailabilityPromises = [];
      // Loop through each date from check-in to check-out
    for (let d = new Date(checkIn); d < new Date(checkOutDate.S); d.setDate(d.getDate() + 1)) {

      const formattedDate = d.toISOString().split("T")[0]; // Format the date as YYYY-MM-DD

      // Retrieve the availability record to find the index of bookingId
      const checkAvailabilityParams = {
        TableName: process.env.DYNAMODB_ROOMS_AVAILABILITY_TABLE,
        Key: { roomType: { S: roomType.S }, date: { S: formattedDate } },
      };
      const availabilityData = await dynamoDbClient.send(new GetItemCommand(checkAvailabilityParams));

      // If the availability record exists and has booking IDs
      if (availabilityData.Item && availabilityData.Item.bookingIds) {
      
        const bookingIds = availabilityData.Item.bookingIds.L.map(id => id.S); // Extract booking IDs as an array of strings
        const bookingIndex = bookingIds.indexOf(bookingId); // Find the index of the booking ID to be canceled

        // If the booking ID is found in the list
        if (bookingIndex !== -1) {
          const updateAvailabilityParams = {
            TableName: process.env.DYNAMODB_ROOMS_AVAILABILITY_TABLE,
            Key: { roomType: { S: roomType.S }, date: { S: formattedDate } },
            UpdateExpression: "SET availableRooms = availableRooms + :count REMOVE bookingIds[" + bookingIndex + "]",
            // Increase the available rooms count and remove the booking ID from the list
            ExpressionAttributeValues: {
              ":count": { N: roomCount.N },
              ":bookingId": { S: bookingId },
            },
            ConditionExpression: "contains(bookingIds, :bookingId)", // Ensure the booking ID exists in the list before updating
          };
          updateAvailabilityPromises.push(dynamoDbClient.send(new UpdateItemCommand(updateAvailabilityParams)));
          // Add the update command to the list of promises to be executed
        }
      }
    }
    await Promise.all(updateAvailabilityPromises); // Execute all update commands in parallel

    // Return a confirmation message
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Booking successfully canceled." }),
    };
  } catch (error) {
    console.error("Error canceling booking:", error); // Log the error for debugging
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Could not cancel the booking.", error: error.message }),
    };
  }
};
