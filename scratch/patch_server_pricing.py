import re

with open('server.ts', 'r') as f:
    content = f.read()

# Fix Razorpay Order Endpoint
razor_pattern = r'if \(req\.body\.amount && Number\(req\.body\.amount\) > 0\) \{\n\s*finalAmount = Math\.round\(Number\(req\.body\.amount\)\);\n\s*\} else \{\n\s*finalAmount = Math\.round\(baseRent \+ commissionFee \+ taxFee \+ systemFee\);\n\s*\}'
new_razor = """// CMS Phase F: Authoritative Backend Pricing - Never trust frontend amount!
      // Number of nights for stay
      const start = new Date(moveInDate || Date.now()).getTime();
      const checkOutStr = req.body.checkOutDate || req.body.configuration?.checkOutDate;
      let nights = 1;
      if (checkOutStr) {
         const end = new Date(checkOutStr).getTime();
         const diff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
         if (diff > 0) nights = diff;
      }
      
      const baseRentTotal = baseRent * nights;
      const calcCommissionFee = (baseRentTotal * commissionRate) / 100;
      const calcTaxFee = (baseRentTotal * taxRate) / 100;
      finalAmount = Math.round(baseRentTotal + calcCommissionFee + calcTaxFee + systemFee);"""

content = re.sub(razor_pattern, new_razor, content)


# Fix POST /api/bookings to also validate totalRent against backend math?
# Or if Razorpay validates it, maybe bookings is okay, but /api/bookings is also used by manual/cash flows?
# Let's just fix Razorpay for now, as that's the Stripe/Razorpay bridge.

with open('server.ts', 'w') as f:
    f.write(content)
print("Patched server authoritative pricing")
