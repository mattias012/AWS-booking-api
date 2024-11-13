// Import necessary modules from AWS SDK v3 for DynamoDB commands
const { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const { v4: uuidv4 } = require("uuid");  // Import UUID library to generate unique booking IDs

// Initialize DynamoDBClient with the AWS region specified in environment variables
const dynamoDbClient = new DynamoDBClient({ region: process.env.REGION });

// Helper function to validate if the requested room setup matches the guest count
function isRoomSetupValid(guestCount, roomType, rooms) {
  const roomCapacity = {
    single: 1,
    double: 2,
    suite: 3
  };
  return guestCount <= roomCapacity[roomType] * rooms;
}

// Helper function to determine room requirements based on guest count if roomType isn't specified
function determineRoomRequirements(guestCount) {
  const roomRequirements = { single: 0, double: 0, suite: 0 };

  while (guestCount > 0) {
    if (guestCount >= 3) {
      roomRequirements.suite += 1;  // Use a suite if guests are 3 or more
      guestCount -= 3;  // Each suite accommodates up to 3 guests
    } else if (guestCount >= 2) {
      roomRequirements.double += 1;  // Double room for 2 guests
      guestCount -= 2;
    } else {
      roomRequirements.single += 1;  // Single room for 1 guest
      guestCount -= 1;
    }
  }
  return roomRequirements;
}

function giveConfirmationAnswer(bookingId, checkInDate, checkOutDate, guestName,  guestCount) {

  //The confirmation should contain:
  //-Bookingid *
  //-Guestname *
  //-Number of guests* and rooms
  //-Total sum of cost
  //-Checkindate and checkoutdate *

    let confirmationAnswer = {
      message: "Booking created successfully!",
      bookingId:bookingId,
      guestName: guestName,
      guestCount: guestCount,
      checkInDate:checkInDate,
      checkOutDate:checkOutDate
    }
    
    return confirmationAnswer;
    
}
// Main handler function that processes the booking request
module.exports.handler = async (event) => {
  // Parse incoming JSON request body to extract booking details
  const { guestName, email, guestCount, roomType, rooms, checkInDate, checkOutDate } = JSON.parse(event.body);
  const bookingId = uuidv4();  // Generate a unique booking ID for this booking
  const checkIn = new Date(checkInDate);  // Parse check-in date
  const checkOut = new Date(checkOutDate);  // Parse check-out date
  const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));  // Calculate number of nights

  let roomCounts;
  
  // Validate room setup if roomType and rooms are specified
  if (roomType && rooms) {
    if (!isRoomSetupValid(guestCount, roomType, rooms)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: `The selected room setup cannot accommodate ${guestCount} guests. Please adjust the number of rooms or room type.` }),
      };
    }
    // Set room counts based on user input
    roomCounts = { [roomType]: rooms };
  } else {
    // Calculate room distribution if roomType is not specified
    roomCounts = determineRoomRequirements(guestCount);
  }

  try {
    // Step 1: Check availability for each required room type across the date range
    for (const [roomType, count] of Object.entries(roomCounts)) {
      if (count === 0) continue;

      const dateAvailabilityPromises = [];
      for (let d = new Date(checkIn); d < checkOut; d.setDate(d.getDate() + 1)) {
        const formattedDate = d.toISOString().split("T")[0];  // Format date as YYYY-MM-DD

        // Define parameters for checking room availability in DynamoDB
        const checkAvailabilityParams = {
          TableName: process.env.DYNAMODB_ROOMS_AVAILABILITY_TABLE,
          Key: {
            roomType: { S: roomType },
            date: { S: formattedDate },
          },
        };
        dateAvailabilityPromises.push(dynamoDbClient.send(new GetItemCommand(checkAvailabilityParams)));
      }

      const availabilityData = await Promise.all(dateAvailabilityPromises);

      for (const data of availabilityData) {
        if (!data.Item || data.Item.availableRooms.N < count) {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: `Not enough ${roomType} rooms available for the selected date range` }),
          };
        }
      }
    }

    // Step 2: Update room availability for each required room type and each day in the date range
    for (const [roomType, count] of Object.entries(roomCounts)) {
      if (count === 0) continue;

      const updateAvailabilityPromises = [];
      for (let d = new Date(checkIn); d < checkOut; d.setDate(d.getDate() + 1)) {
        const formattedDate = d.toISOString().split("T")[0];

        const updateAvailabilityParams = {
          TableName: process.env.DYNAMODB_ROOMS_AVAILABILITY_TABLE,
          Key: {
            roomType: { S: roomType },
            date: { S: formattedDate },
          },
          UpdateExpression: "SET availableRooms = availableRooms - :count, bookingIds = list_append(if_not_exists(bookingIds, :emptyList), :newBookingId)",
          ExpressionAttributeValues: {
            ":count": { N: count.toString() },  // Decrement by the number of rooms needed
            ":newBookingId": { L: [{ S: bookingId }] },  // Append booking ID to list of bookings
            ":emptyList": { L: [] }  // Initialize bookingIds as an empty list if it does not exist
          },
          ConditionExpression: "availableRooms >= :count",  // Ensure there are enough available rooms
        };
        
        
        updateAvailabilityPromises.push(dynamoDbClient.send(new UpdateItemCommand(updateAvailabilityParams)));
      }
      await Promise.all(updateAvailabilityPromises);
    }

    // Step 3: Create booking entry with room counts for each room type
    const bookingEntries = [];
    for (const [roomType, count] of Object.entries(roomCounts)) {
      if (count === 0) continue;

      const newBooking = {
        bookingId: { S: bookingId },  // Chnaged, using the same bookingId generated earlier
        guestName: { S: guestName },
        guestCount: { S: guestCount.toString() },
        email: { S: email },
        roomType: { S: roomType },
        roomCount: { N: count.toString() },
        checkInDate: { S: checkInDate },
        checkOutDate: { S: checkOutDate },
        nights: { N: nights.toString() },
        createdAt: { S: new Date().toISOString() },
      };
      bookingEntries.push(dynamoDbClient.send(new PutItemCommand({
        TableName: process.env.DYNAMODB_BOOKINGS_TABLE,
        Item: newBooking,
      })));
    }
    await Promise.all(bookingEntries);

    let confirmationAnswer = giveConfirmationAnswer(bookingId, checkInDate, checkOutDate, guestName, guestCount);

    return {
      statusCode: 201,
      body: JSON.stringify(confirmationAnswer),
    };
  } catch (error) {
    console.error("Error creating booking:", error.stack);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Could not create booking", details: error.message }),
    };
  }
};
