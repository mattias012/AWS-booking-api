module.exports.handler = async (event) => {
    const bookingId = event.pathParameters.id;
    // Mockup response for deleting a booking by ID
    return {
      statusCode: 200,
      body: JSON.stringify({ message: `Deleted booking with ID: ${bookingId}` }),
    };
  };
  