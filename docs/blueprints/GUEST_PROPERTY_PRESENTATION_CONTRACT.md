# GUEST PROPERTY PRESENTATION CONTRACT
> This is the authoritative source definition for every Guest-visible field.
> No Guest-facing component may consume an undefined or hardcoded field.

FIELD                         OWNER      HOST INPUT              DB FIELD                    API FIELD              GUEST COMPONENT                    SCOPE     REQUIRED  FALLBACK
──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Property title                Host       Step 1: Title           listings.title              listing.title          ListingDetailsNew <h1>              Property  YES       "Your property title"
Property description          Host       Step 1: Description     listings.description        listing.description    ListingDetailsNew about section     Property  YES       Generic placeholder
Property type                 Host       Step 1: Type select     listings.type               listing.type           ListingDetailsNew badge             Property  YES       "Resort"
Hero video URL                Host       Step 4: Hero Video      listings.hero_video_url     listing.hero_video_url ListingDetailsNew hero media        Property  NO        None (static image)
Dominant color hex            Host       Step 4: Color picker    listings.dominant_color_hex listing.dom_color_hex  ListingDetailsNew ambient glow      Property  NO        '#06b6d4'
Experience/sensory tags       Host       Step 4: Tag selector    listings.experience_tags    listing.experience_tags ListingDetailsNew sensory strip    Property  NO        Hardcoded 5 defaults (to be removed)
SEO title                     Host       Step 6: SEO             listings.seo_title          listing.seo_title      <SEO> component                    Property  NO        listing.title + " | Encho"
SEO description               Host       Step 6: SEO             listings.seo_description    listing.seo_description <SEO> component                   Property  NO        listing.description substring
City/location                 Host       Step 2: Location        listings.city               listing.city           ListingDetailsNew location badge   Property  YES       None
Full address                  Host       Step 2: Location        listings.address            listing.address        ListingDetailsNew expanded view     Property  YES       None
Latitude/Longitude            Host       Step 2: Map pin         listings.lat, listings.lng  listing.lat/lng        Map component                      Property  NO        None
Neighborhood POIs             Host       Step 2: Nearby items    listings.nearby             listing.nearby         ListingDetailsNew neighborhood radar Property NO       NONE (remove hardcoded Wayanad)
House rules/guidelines        Host       Step 6: Guidelines      listings.curated_guidelines listing.curated_guidelines ListingDetailsNew guidelines accordion Property NO Hardcoded defaults (to be removed)
Child safety specs            Host       Step 5: Safety          listings.child_safety_specs listing.child_safety_specs ListingDetailsNew safety section Property NO  None (section hidden if empty)
Rating                        System     Auto from reviews       listings.rating             listing.rating         ListingDetailsNew star badge       Property  NO        None (hide if no reviews)
Review count                  System     Auto from reviews       listings.reviewCount        listing.reviewCount    ListingDetailsNew review count     Property  NO        None
──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Rental mode                   Host       Step 3: Mode select     listings.rental_mode        listing.rental_mode    ListingDetailsNew room selector    Property  YES       'entire_place'
Base price (entire place)     Host       Step 7: Pricing         listings.price              listing.price          ListingDetailsNew booking card     Property  CONDITIONAL (required if rental_mode != private_rooms)
──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Room type name                Host       Step 3: Room name       listings.rooms[].name       listing.rooms[].name   ListingDetailsNew room tab label   Room      YES       None
Room type tier key            Host       Step 3: Tier classify   listings.rooms[].type       listing.rooms[].type   SanctuaryGalleryModal tab routing  Room      YES       'common'
Room type description         Host       Step 3: Room desc       listings.rooms[].description listing.rooms[].desc  ListingDetailsNew room card        Room      NO        None (section hidden)
Room type price               Host       Step 3: Room price      listings.rooms[].price      listing.rooms[].price  ListingDetailsNew booking card     Room      YES       None (room inactive if no price)
Room type capacity            Host       Step 3: Occupancy       listings.rooms[].capacity   listing.rooms[].capacity ListingDetailsNew guest stepper  Room      YES       None
Room inventory count          Host       Step 3: Inventory       listings.rooms[].inv_count  listing.rooms[].inv    Availability check                 Room      YES       1
Room type features/specs      Host       Step 3: Features        listings.rooms[].features   listing.rooms[].features ListingDetailsNew specs line     Room      NO        None
Room type amenities           Host       Step 3: Amenities       listings.rooms[].amenities  listing.rooms[].amenities ListingDetailsNew amenity list  Room      NO        None
──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Property photos (common tier) Host       Step 4: Photo upload    listings.photos (tier=common) listing.photos       SanctuaryGalleryModal common tab   Property  NO        None
Room type photos (suite tier) Host       Step 3: Room photos     listings.photos (tier=suites) listing.photos      SanctuaryGalleryModal suites tab   Room      NO        None
Room type photos (deluxe)     Host       Step 3: Room photos     listings.photos (tier=deluxe) listing.photos      SanctuaryGalleryModal deluxe tab   Room      NO        None
Room type photos (executive)  Host       Step 3: Room photos     listings.photos (tier=exec)   listing.photos      SanctuaryGalleryModal exec tab     Room      NO        None
Hero/cover image              Host       Step 4: First photo     listings.image_url            listing.imageUrl    ListingDetailsNew OG/cover         Property  YES       None
Image array (flat)            Host       Step 4: All photos      listings.image_urls           listing.imageUrls   ListingDetailsNew (legacy fallback) Property NO        Unsplash defaults (to be removed)
──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
General amenities             Host       Step 5: Amenities       listings.amenities            listing.amenities   ListingDetailsNew "What this offers" Property NO       None (section hidden if empty)
Amenity clusters              Host       Step 5: Clusters        listings.amenity_clusters     listing.am_clusters ListingDetailsNew cluster view     Property  NO        None
──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
Booking price (server)        Server     Validated from rooms[]  listings.rooms[].price        /api/rooms/price    Checkout payment                   Booking   YES       REJECT if mismatch

