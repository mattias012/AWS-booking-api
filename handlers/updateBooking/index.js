// Import necessary AWS SDK commands for DynamoDB, remember v3
const { DynamoDBClient, GetItemCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");

// Initialize DynamoDB client with the specified AWS region
const dynamoDbClient = new DynamoDBClient({ region: process.env.REGION });

/*
 * Function to check if there is enough room availability for the new booking dates.
 * We will use this function to validate the new booking details before updating the booking.
 */
async function checkAvailability(roomCounts, checkIn, checkOut) {
  for (const [roomType, count] of Object.entries(roomCounts)) {
    const dateAvailabilityPromises = [];
    
    // Loop through each date in the booking range to check availability
    for (let d = new Date(checkIn); d < checkOut; d.setDate(d.getDate() + 1)) {
      const formattedDate = d.toISOString().split("T")[0]; // Format date as "YYYY-MM-DD"
      
      // Define DynamoDB parameters for checking room availability on a specific date
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
  const bookingId = event.pathParameters.id;

  // Parse and validate input with default values
  const { guestName = "", guestCount = 0, roomType = "", roomCount = 0, checkInDate, checkOutDate, email = "" } = JSON.parse(event.body);

  // Debug logging
  console.log('Received values:', { guestCount, roomCount });

  // Input Validation
  if (!guestName || typeof guestName !== "string" || !email || typeof email !== "string") {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Invalid guestName or email. Both must be non-empty strings." }),
    };
  }

  // Ensure guestCount and roomCount are numbers and not null
  const validatedGuestCount = Number(guestCount);
  const validatedRoomCount = Number(roomCount);

  console.log('Validated values:', { validatedGuestCount, validatedRoomCount });

  if (isNaN(validatedGuestCount) || validatedGuestCount < 1) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Invalid guestCount. It must be a positive number." }),
    };
  }

  if (isNaN(validatedRoomCount) || validatedRoomCount < 1) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Invalid roomCount. It must be a positive number." }),
    };
  }

  // Update booking details in DynamoDB with validated values
  const updateBookingParams = {
    TableName: process.env.DYNAMODB_BOOKINGS_TABLE,
    Key: { 
      bookingId: { S: bookingId } 
    },
    UpdateExpression: "SET guestName = :guestName, guestCount = :guestCount, roomType = :roomType, roomCount = :roomCount, checkInDate = :checkInDate, checkOutDate = :checkOutDate, email = :email",
    ExpressionAttributeValues: {
      ":guestName": { S: guestName },
      ":guestCount": { N: validatedGuestCount.toString() },
      ":roomType": { S: roomType },
      ":roomCount": { N: validatedRoomCount.toString() },
      ":checkInDate": { S: checkInDate },
      ":checkOutDate": { S: checkOutDate },
      ":email": { S: email }
    },
    ReturnValues: "ALL_NEW"  // This will return the updated item
  };

  try {
    const result = await dynamoDbClient.send(new UpdateItemCommand(updateBookingParams));
    console.log('Update result:', result);
    
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: "Booking updated successfully.",
        updatedBooking: result.Attributes
      }),
    };
  } catch (error) {
    console.error("Error updating booking:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        message: "Could not update the booking.", 
        error: error.message 
      }),
    };
  }
};

/*
 * Helper function to update room availability by adding or removing the booking.
 * Adjusts the availability record for each date by either decreasing or increasing the room count,
 * and managing booking IDs in the room availability records..
 */
async function updateRoomAvailability(roomType, count, checkInDate, checkOutDate, bookingId, action) {
  // Validera count
  const validCount = parseInt(count) || 0;
  
  for (let d = new Date(checkInDate); d < new Date(checkOutDate); d.setDate(d.getDate() + 1)) {
    const formattedDate = d.toISOString().split("T")[0];

    const updateParams = {
      TableName: process.env.DYNAMODB_ROOMS_AVAILABILITY_TABLE,
      Key: { roomType: { S: roomType }, date: { S: formattedDate } },
      UpdateExpression: action === "add"
        ? "SET availableRooms = availableRooms - :count, bookingIds = list_append(if_not_exists(bookingIds, :emptyList), :newBookingId)"
        : "SET availableRooms = availableRooms + :count REMOVE bookingIds[0]",
      ExpressionAttributeValues: {
        ":count": { N: validCount.toString() },
      },
    };

    if (action === "add") {
      updateParams.ExpressionAttributeValues[":newBookingId"] = { L: [{ S: bookingId }] };
      updateParams.ExpressionAttributeValues[":emptyList"] = { L: [] };
    }

    try {
      await dynamoDbClient.send(new UpdateItemCommand(updateParams));
    } catch (error) {
      console.error(`Error updating availability for date ${formattedDate}:`, error);
      throw error;
    }
  }
}

/*
 * Function to calculate room requirements based on the number of guests.
 * If the room type is not specified, this function allocates rooms based on guest count.
 */
function determineRoomRequirements(guestCount) {
  const roomRequirements = { single: 0, double: 0, suite: 0 };

  while (guestCount > 0) {
    if (guestCount >= 3) {
      roomRequirements.suite += 1; // Allocate a suite if there are 3 or more guests
      guestCount -= 3;             // A suite accommodates up to 3 guests
    } else if (guestCount >= 2) {
      roomRequirements.double += 1; // Allocate a double room for 2 guests
      guestCount -= 2;
    } else {
      roomRequirements.single += 1; // Allocate a single room for 1 guest
      guestCount -= 1;
    }
  }

  return roomRequirements; // Return the calculated room distribution
}
