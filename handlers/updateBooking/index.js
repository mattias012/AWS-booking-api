// Import necessary AWS SDK commands for DynamoDB, remember v3
const { DynamoDBClient, GetItemCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");

// Initialize DynamoDB client with the specified AWS region
const dynamoDbClient = new DynamoDBClient({ region: process.env.REGION });

// Function to check if there is enough room availability for the new booking dates.
// We will use this function to validate the new booking details before updating the booking.
// Basically the same function as in createBooking/index.js
async function checkAvailability(roomCounts, checkIn, checkOut) {
  for (const [roomType, count] of Object.entries(roomCounts)) {
    const dateAvailabilityPromises = [];
    
    // Loop through each date in the booking range to check availability
    for (let d = new Date(checkIn); d < checkOut; d.setDate(d.getDate() + 1)) {
      const formattedDate = d.toISOString().split("T")[0]; // Format date as "YYYY-MM-DD"
      const checkAvailabilityParams = {
        TableName: process.env.DYNAMODB_ROOMS_AVAILABILITY_TABLE,
        Key: { roomType: { S: roomType }, date: { S: formattedDate } },
      };
      // Add each availability check for the date to the promise array
      dateAvailabilityPromises.push(dynamoDbClient.send(new GetItemCommand(checkAvailabilityParams)));
    }
    
    // Resolve all promises to retrieve availability data for each date
    const availabilityData = await Promise.all(dateAvailabilityPromises);
    for (const data of availabilityData) {
      // If a date lacks availability or doesn't have enough rooms, return false
      if (!data.Item || data.Item.availableRooms.N < count) {
        return false; 
      }
    }
  }
  return true; // All dates have enough available rooms, then we can return true
}

// Main Lambda function handler for updating a booking
module.exports.handler = async (event) => {
  // Extract the booking ID from the request path
  const bookingId = event.pathParameters.id;

  // Parse the new booking details from the request body
  const { guestName, guestCount, roomType, rooms, checkInDate, checkOutDate } = JSON.parse(event.body);

  try {
    // Step 1: Retrieve current booking details to compare old and new values
    const getBookingParams = {
      TableName: process.env.DYNAMODB_BOOKINGS_TABLE,
      Key: { bookingId: { S: bookingId } },
    };
    const bookingData = await dynamoDbClient.send(new GetItemCommand(getBookingParams));

    // If booking does not exist, return a 404 error response
    if (!bookingData.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Booking not found." }),
      };
    }

    // Extract current booking details for use in updating the availability
    const { checkInDate: oldCheckInDate, checkOutDate: oldCheckOutDate, roomType: oldRoomType, roomCount: oldRoomCount } = bookingData.Item;
    const newCheckIn = new Date(checkInDate);
    const newCheckOut = new Date(checkOutDate);

    // Calculate required rooms based on new guest count and room type
    const roomCounts = roomType && rooms ? { [roomType]: rooms } : determineRoomRequirements(guestCount);

    // Step 2: Check availability for the new room configuration and dates
    const isAvailable = await checkAvailability(roomCounts, newCheckIn, newCheckOut);
    if (!isAvailable) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "The selected room is not available for the new dates." }),
      };
    }

    // Step 3: Adjust availability by removing the old booking and adding the new configuration
    await updateRoomAvailability(oldRoomType.S, oldRoomCount.N, oldCheckInDate.S, oldCheckOutDate.S, bookingId, "remove");
    await updateRoomAvailability(roomType, rooms, checkInDate, checkOutDate, bookingId, "add");

    // Step 4: Update booking details in DYNAMODB_BOOKINGS_TABLE to reflect new information
    const updateBookingParams = {
      TableName: process.env.DYNAMODB_BOOKINGS_TABLE,
      Key: { bookingId: { S: bookingId } },
      UpdateExpression: "SET guestName = :guestName, guestCount = :guestCount, roomType = :roomType, roomCount = :roomCount, checkInDate = :checkInDate, checkOutDate = :checkOutDate",
      ExpressionAttributeValues: {
        ":guestName": { S: guestName },
        ":guestCount": { S: guestCount.toString() },
        ":roomType": { S: roomType },
        ":roomCount": { N: rooms.toString() },
        ":checkInDate": { S: checkInDate },
        ":checkOutDate": { S: checkOutDate },
      },
    };
    await dynamoDbClient.send(new UpdateItemCommand(updateBookingParams));

    // Return a success response confirming booking update
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Booking updated successfully." }),
    };
  } catch (error) {
    console.error("Error updating booking:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Could not update the booking.", error: error.message }),
    };
  }
};

 // Function to update room availability by adding or removing the booking.
async function updateRoomAvailability(roomType, count, checkInDate, checkOutDate, bookingId, action) {
  // Loop through each date in the booking range
  for (let d = new Date(checkInDate); d < new Date(checkOutDate); d.setDate(d.getDate() + 1)) {
    const formattedDate = d.toISOString().split("T")[0];

    //Update database with new availability
    const updateParams = {
      TableName: process.env.DYNAMODB_ROOMS_AVAILABILITY_TABLE,
      Key: { roomType: { S: roomType }, date: { S: formattedDate } },
      UpdateExpression: action === "add" 
        ? "SET availableRooms = availableRooms - :count, bookingIds = list_append(if_not_exists(bookingIds, :emptyList), :newBookingId)"
        : "SET availableRooms = availableRooms + :count REMOVE bookingIds[0]",
      ExpressionAttributeValues: {
        ":count": { N: count.toString() },
        ":newBookingId": { L: [{ S: bookingId }] },
        ":emptyList": { L: [] },
      },
      ConditionExpression: action === "add" ? "availableRooms >= :count" : undefined,
    };
    // Execute the update command for each date in the range
    await dynamoDbClient.send(new UpdateItemCommand(updateParams));
  }
}
