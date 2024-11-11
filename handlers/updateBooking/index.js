module.exports.handler = async (event) => {
    const bookingId = event.pathParameters.id;
    // Mockup response for updating a booking by ID
    return {
      statusCode: 200,
      body: JSON.stringify({ message: `Updated booking with ID: ${bookingId}` }),
    };
  };
  