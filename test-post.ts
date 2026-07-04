async function testPost() {
  try {
    const res = await fetch("http://localhost:3000/api/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Test Listing",
        description: "Test Desc",
        price: 1500,
        type: "Apartment",
        rentalMode: "hybrid",
        rooms: [],
        address: "Test Addr",
        city: "Berlin",
        maxGuests: 2,
        bedrooms: 1,
        beds: 1,
        bathrooms: 1,
        amenities: ["WiFi"],
        lat: 52.5200,
        lng: 13.4050,
        imageUrl: "http://example.com/image.png",
        imageUrls: [],
        videoUrl: ""
      })
    });
    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Body:", text);
  } catch(e) {
    console.error(e);
  }
}
testPost();
