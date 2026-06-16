# AutoEngage Field Mapping Reference

---

## 1. Bullmenn — Service Reminder

### Client File → AutoEngage Mapping

| Client Field | AutoEngage Field |
|---|---|
| Sale Date | `purchase_date` |
| Dealer | `workshop_code` |
| Phone No | `phone_number` |
| Model | `vehicle_model` |
| Chassis No | `vin_number` |
| Sales Customer Name | `person_name` |
| Vehicle Number | `reg_number` |
| Last Service Date | `last_service_date` |
| Service Due Date | `next_service_due` |
| Location | _(unmapped)_ |
| Dealer Name | _(unmapped)_ |

### AutoEngage Output Column Order

```
workshop_code
purchase_date
vin_number
next_service_due
person_name
vehicle_model
reg_number
phone_number
alt_phone_number_2
last_service_date
```

---

## 2. Ambal ERODE — Service Reminder

### Client File → AutoEngage Mapping

| Client Field | AutoEngage Field |
|---|---|
| Dealer Code | `workshop_code` |
| VIN | `vin_number` |
| Due Date | `next_service_due` |
| Cust. Name | `person_name` |
| Model Name | `vehicle_model` |
| Registration Num | `reg_number` |
| Customer Mobile No. | `phone_number` |
| Last Scheduled Service KM | `odometer_reading` |
| Last Scheduled Service Date | `last_service_date` |
| Current Loyalty Points | `customer_score` |
| Location | _(unmapped)_ |
| Region | _(unmapped)_ |
| Due Months | _(unmapped)_ |
| EW Valid Date | _(unmapped)_ |
| EW Warranty Type | _(unmapped)_ |
| Name | _(unmapped)_ |
| Mobile Number | _(unmapped)_ |
| Car User Phone | _(unmapped)_ |
| MI Contact No | _(unmapped)_ |

### AutoEngage Output Column Order

```
workshop_code
vin_number
next_service_due
person_name
vehicle_model
reg_number
phone_number
alt_phone_number_2
odometer_reading
last_service_date
customer_score
purpose_of_visit       ← DEFAULT: "yearly service"
```

---

## 3. Ambal SAIBABA — Service Reminder

### Client File → AutoEngage Mapping

| Client Field | AutoEngage Field |
|---|---|
| Dealer Code | `workshop_code` |
| VIN | `vin_number` |
| Due Date | `next_service_due` |
| Cust. Name | `person_name` |
| Model Name | `vehicle_model` |
| Registration Num | `reg_number` |
| Mobile Number | `phone_number` |
| Last Scheduled Service KM | `odometer_reading` |
| Last Scheduled Service Date | `last_service_date` |
| Current Loyalty Points | `customer_score` |
| Location | _(unmapped)_ |
| Region | _(unmapped)_ |
| Due Months | _(unmapped)_ |
| EW Valid Date | _(unmapped)_ |
| EW Warranty Type | _(unmapped)_ |
| Name | _(unmapped)_ |
| Customer Mobile No. | _(unmapped)_ |
| Car User Phone | _(unmapped)_ |
| MI Contact No | _(unmapped)_ |

### AutoEngage Output Column Order

```
workshop_code
vin_number
next_service_due
person_name
vehicle_model
reg_number
phone_number
alt_phone_number_2
odometer_reading
last_service_date
customer_score
purpose_of_visit       ← DEFAULT: "yearly service"
```

---

## 4. SURYABALA — Service Reminder

### Client File → AutoEngage Mapping

| Client Field | AutoEngage Field |
|---|---|
| Customer Name | `person_name` |
| Contact Number | `phone_number` |
| Model Name | `vehicle_model` |
| Registration No. | `reg_number` |
| Next Service Type | `service_type` |
| Next Service Date | `next_service_due` |
| Frame # | `vin_number` |
| Selling Dealer | _(unmapped)_ |
| Name | _(unmapped)_ |
| Last Service Dealer | _(unmapped)_ |
| Last Service Date | _(unmapped)_ |
| Engine No / Motor No | _(unmapped)_ |
| Last Service Kms | _(unmapped)_ |
| Last Service Division | _(unmapped)_ |
| Last Service Type | _(unmapped)_ |
| Dlr Invoice Date | _(unmapped)_ |
| Missed Service Date | _(unmapped)_ |

### AutoEngage Output Column Order

```
person_name
phone_number
vehicle_model
reg_number
service_type
next_service_due
vin_number
```

---

## 5. ICARE — Post Service Feedback

### Client File → AutoEngage Mapping

| Client Field | AutoEngage Field |
|---|---|
| Location Name | `showroom_code` |
| Bill No | `lead_tags` |
| Customer | `person_name` |
| Mobile No | `phone_number` |
| S.No | _(unmapped)_ |
| Terminal Name | _(unmapped)_ |
| Type | _(unmapped)_ |
| SME | _(unmapped)_ |
| Bill Date | _(unmapped)_ |
| Service Call No | _(unmapped)_ |
| Item Value | _(unmapped)_ |
| Tax Amt | _(unmapped)_ |
| Bill Amt | _(unmapped)_ |

### AutoEngage Output Column Order

```
showroom_code
person_name
phone_number
lead_tags
```

---

## 6. Anant Cars — Sales / Lead Campaign

### Client File → AutoEngage Mapping

| Client Field | AutoEngage Field |
|---|---|
| Customer Name | `person_name` |
| Customer Phone | `phone_number` |
| Product Family | `interested_vehicle_name` |
| Stage | _(unmapped)_ |
| Enquiry Date | _(unmapped)_ |
| Variant Description | _(unmapped)_ |
| Color | _(unmapped)_ |
| Fuel Type | _(unmapped)_ |
| Seating Capacity | _(unmapped)_ |
| Test Drive Generated | _(unmapped)_ |
| Test Drive Stage | _(unmapped)_ |
| First Followup Remarks Type | _(unmapped)_ |
| Recent Followup Remarks | _(unmapped)_ |
| Recent Followup SC Remark | _(unmapped)_ |

### AutoEngage Output Column Order

```
showroom_code
region_name
dealership_id
person_name
phone_number
interested_vehicle_name
interested_vehicle_brand_name  ← DEFAULT: "Mahindra"
seating_capacity_preference
city
pincode
subdivision_name
alt_phone_number_2
lead_source
```

### Product Family → `interested_vehicle_name` (formatter normalization)

Client shared model name (even if the client shares variants like below, the formatter normalizes `interested_vehicle_name`):

| Output | Client-style name |
|---|---|
| BOLERO | Bolero |
| SCORPIO-N / NEW SCORPIO | Scorpio N |
| NEW THAR | Thar |
| XUV700 / XUV 700 | XUV700 |
| SCORPIO CLASSIC | Scorpio Classic |
| XUV400 EV | XUV400 EV |
| Not Available | Marazzo |
| XUV300 / XUV 300 | XUV300 |
| BOLERO NEO | Bolero Neo |
| XUV 3XO / XUV3XO | XUV 3XO |
| XUV 7XO | XUV 7XO |
| THAR ROXX | Thar ROXX |
| XEV 9E | XEV 9e |
| BE 6 | BE 6 |
| XUV3XO EV | XUV 3XO EV |
| XEV 9S | XEV 9S |
| UDO | UDO |

---

## 7. Fortune Hyryder — Sales / Lead Campaign

### Client File → AutoEngage Mapping

| Client Field | AutoEngage Field |
|---|---|
| Enquiry Name, NAMES, CUSTOMER NAME | `person_name` |
| MODEL | `interested_vehicle_name` |
| Contact Number, MOBILE NO, MOBILE NUMBER | `phone_number` |
| Mode, ENQUIRY_MODE_NAME | _(unmapped — add column if needed)_ |

### AutoEngage Output Column Order

```
showroom_code
person_name
phone_number
interested_vehicle_name    ← DEFAULT: "Urban Cruiser Hyryder"
interested_vehicle_brand_name    ← DEFAULT: "Toyota Kirloskar Motor"
```

---

## 8. Fortune Toyota — Post Sales / Lead Campaign

### Client File → AutoEngage Mapping

| Client Field | AutoEngage Field |
|---|---|
| Service Due Date | `next_service_due` |
| Workshop | `workshop_code` |
| Predicted Service Type | `service_plan_type` |
| Last CRE | _(unmapped)_ |
| Customer Name | `person_name` |
| Contact Number | `phone_number` |
| Reg No. | `reg_number` |
| VIN No. | `vin_number` |
| Model | `vehicle_model` |
| Sale Date | `purchase_date` |
| Sold By | _(unmapped)_ |

### AutoEngage Output Column Order

```
next_service_due
workshop_code
service_plan_type
person_name
phone_number
reg_number
vin_number
vehicle_model
purchase_date
```

vehicle_model name → Client shared model name (even if the client share like this while using formatter it should come as vehicle_model)
Glanza → Glanza
Urban Cruiser Taisor → Urban Cruiser Taisor
Urban Cruiser Hyryder → Urban Cruiser Hyryder
Urban Cruiser Hyryder Hybrid → Urban Cruiser Hyryder Hybrid
Innova Crysta → Innova Crysta
Innova Hycross → Innova Hycross
Innova Hycross Hybrid → Innova Hycross Hybrid
Fortuner → Fortuner
Fortuner Legender → Fortuner Legender
Hilux → Hilux
Camry → Camry
Camry Hybrid → Camry Hybrid
Vellfire → Vellfire
Etios → Etios
Etios Liva → Etios Liva
Corolla Altis → Corolla Altis

