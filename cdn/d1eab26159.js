const axios = require("axios")
const crypto = require("crypto")
const { v4: uuidv4 } = require("uuid")

class Ovo {
  constructor(authToken = false) {
    this.BASE_API = "https://api.ovo.id"
    this.AGW_API = "https://agw.ovo.id"
    this.AWS_API = "https://api.cp1.ovo.id"

    this.os = "iOS"
    this.app_version = "3.43.0"
    this.client_id = "ovo_ios"
    this.user_agent = "OVO/17767 CFNetwork/1220.1 Darwin/20.3.0"
    this.device_id = "6AA4E427-D1B4-4B7E-9C22-F4C0F86F2CFD"
    this.push_notification_id = "e35f5a9fc1b61d0ab0c83ee5ca05ce155f82dcffee0605f1c70de38e662db362"

    this.auth_token = authToken
    this.hmac_hash = null
    this.hmac_hash_random = null
  }

  generateUUIDV4() {
    return uuidv4().toUpperCase()
  }

  generateRandomSHA256() {
    return crypto.createHmac("sha256", "ovo-apps").update(Date.now().toString()).digest("hex")
  }

  headers(bearer = false) {
    const headers = {
      "content-type": "application/json",
      accept: "*/*",
      "app-version": this.app_version,
      "client-id": this.client_id,
      "device-id": this.device_id,
      os: this.os,
      "user-agent": this.user_agent,
    }

    if (this.auth_token) {
      headers["authorization"] = `${bearer} ${this.auth_token}`
    }

    return headers
  }

  async sendOtp(phoneNumber) {
    const field = {
      msisdn: phoneNumber,
      device_id: this.device_id,
      otp: {
        locale: "EN",
        sms_hash: "abc",
      },
      channel_code: "ovo_ios",
    }

    return await this.request(`${this.AGW_API}/v3/user/accounts/otp`, field, this.headers())
  }

  async OTPVerify(phoneNumber, otpRefId, otpCode) {
    const field = {
      channel_code: "ovo_ios",
      otp: {
        otp_ref_id: otpRefId,
        otp: otpCode,
        type: "LOGIN",
      },
      msisdn: phoneNumber,
      device_id: this.device_id,
    }

    return await this.request(`${this.AGW_API}/v3/user/accounts/otp/validation`, field, this.headers())
  }

  async getAuthToken(phoneNumber, otpRefId, otpToken, securityCode) {
    const field = {
      msisdn: phoneNumber,
      device_id: this.device_id,
      push_notification_id: this.push_notification_id,
      credentials: {
        otp_token: otpToken,
        password: {
          value: await this.hashPassword(phoneNumber, otpRefId, securityCode),
          format: "rsa",
        },
      },
      channel_code: "ovo_ios",
    }

    return await this.request(`${this.AGW_API}/v3/user/accounts/login`, field, this.headers())
  }

  async getPublicKeys() {
    return await this.request(`${this.AGW_API}/v3/user/public_keys`, false, this.headers())
  }

  async getLastTransactions(limit = 5) {
    return await this.request(
      `${this.BASE_API}/wallet/transaction/last?limit=${limit}&transaction_type=TRANSFER&transaction_type=EXTERNAL%20TRANSFER`,
      false,
      this.headers(),
    )
  }

  async getTransactionDetails(merchantId, merchantInvoice) {
    return await this.request(
      `${this.BASE_API}/wallet/transaction/${merchantId}/${merchantInvoice}`,
      false,
      this.headers(),
    )
  }

  async getFavoriteTransfer() {
    return await this.request(`${this.AWS_API}/user-profiling/favorite-transfer`, false, this.headers())
  }

  async hashPassword(phoneNumber, otpRefId, securityCode) {
    const publicKeysResponse = await this.getPublicKeys()
    const publicKeysData = JSON.parse(publicKeysResponse)
    const rsaKey = publicKeysData.data.keys[0].key

    const data = [
      "LOGIN",
      securityCode,
      Date.now().toString(),
      this.device_id,
      phoneNumber,
      this.device_id,
      otpRefId,
    ].join("|")

    const encrypted = crypto.publicEncrypt(rsaKey, Buffer.from(data))
    return encrypted.toString("base64")
  }

  async getEmail() {
    return await this.request(`${this.AGW_API}/v3/user/accounts/email`, false, this.headers())
  }

  async transactionHistory(page = 1, limit = 10) {
    return await this.requests(
      `${this.AGW_API}/payment/orders/v1/list?limit=${limit}&page=${page}`,
      false,
      this.headers("Bearer"),
    )
  }

  async walletInquiry() {
    return await this.request(`${this.BASE_API}/wallet/inquiry`, false, this.headers())
  }

  async getOvoCash() {
    const walletData = await this.walletInquiry()
    const parsed = JSON.parse(walletData)
    return parsed.data["001"].card_balance
  }

  async getOvoCashCardNumber() {
    const walletData = await this.walletInquiry()
    const parsed = JSON.parse(walletData)
    return parsed.data["001"].card_no
  }

  async getOvoPointsCardNumber() {
    const walletData = await this.walletInquiry()
    const parsed = JSON.parse(walletData)
    return parsed.data["600"].card_no
  }

  async getOvoPoints() {
    const walletData = await this.walletInquiry()
    const parsed = JSON.parse(walletData)
    return parsed.data["600"].card_balance
  }

  async getPointDetails() {
    const hmacData = await this.getHmac()
    const json = Buffer.from(JSON.parse(hmacData).encrypted_string, "base64").toString()
    const parsedJson = JSON.parse(json)
    this.hmac_hash = parsedJson.hmac
    this.hmac_hash_random = parsedJson.random
    return await this.request(`${this.AGW_API}/api/v1/get-expired-webview`, false, this.commander_headers())
  }

  async getHmac() {
    return await this.request(
      "https://commander.ovo.id/api/v1/auth/hmac?type=1&encoded=",
      false,
      this.commander_headers(),
    )
  }

  async getBillerList() {
    return await this.request(
      `${this.AWS_API}/gpdm/ovo/1/v1/billpay/catalogue/getCategories?categoryID=0&level=1`,
      false,
      this.headers(),
    )
  }

  async getBillerCategory(categoryId) {
    return await this.request(
      `${this.AWS_API}/gpdm/ovo/ID/v2/billpay/get-billers?categoryID=${categoryId}`,
      false,
      this.headers(),
    )
  }

  async getDenominations(productId) {
    return await this.request(
      `${this.AWS_API}/gpdm/ovo/ID/v1/billpay/get-denominations/${productId}`,
      false,
      this.headers(),
    )
  }

  async getBankList() {
    return await this.request(`${this.BASE_API}/v1.0/reference/master/ref_bank`, false, this.headers())
  }

  async getUnreadNotifications() {
    return await this.request(`${this.BASE_API}/v1.0/notification/status/count/UNREAD`, false, this.headers())
  }

  async getAllNotifications() {
    return await this.request(`${this.BASE_API}/v1.0/notification/status/all`, false, this.headers())
  }

  async getInvestment() {
    return await this.request("https://investment.ovo.id/customer", false, this.headers())
  }

  async billerInquiry(billerId, productId, denominationId, customerId) {
    const field = {
      product_id: productId,
      biller_id: billerId,
      customer_number: customerId,
      denomination_id: denominationId,
      period: 0,
      payment_method: ["001", "600", "SPLIT"],
      customer_id: customerId,
      phone_number: customerId,
    }

    return await this.request(`${this.AWS_API}/gpdm/ovo/ID/v2/billpay/inquiry?isFavorite=false`, field, this.headers())
  }

  async billerPay(billerId, productId, orderId, amount, customerId) {
    const field = {
      bundling_request: [
        {
          product_id: productId,
          biller_id: billerId,
          order_id: orderId,
          customer_id: customerId,
          parent_id: "",
          payment: [
            {
              amount: Number.parseInt(amount),
              card_type: "001",
            },
            {
              card_type: "600",
              amount: 0,
            },
          ],
        },
      ],
      phone_number: customerId,
    }

    return await this.request(`${this.AWS_API}/gpdm/ovo/ID/v1/billpay/pay`, field, this.headers())
  }

  async isOVO(amount, phoneNumber) {
    const field = {
      amount: amount,
      mobile: phoneNumber,
    }

    return await this.request(`${this.BASE_API}/v1.1/api/auth/customer/isOVO`, field, this.headers())
  }

  async generateTrxId(amount, actionMark = "OVO Cash") {
    const field = {
      amount: amount,
      actionMark: actionMark,
    }

    return await this.request(`${this.BASE_API}/v1.0/api/auth/customer/genTrxId`, field, this.headers())
  }

  generateSignature(amount, trxId) {
    const data = [trxId, amount, this.device_id].join("||")
    return crypto.createHash("sha1").update(data).digest("hex")
  }

  async unlockAndValidateTrxId(amount, trxId, securityCode) {
    const field = {
      trxId: trxId,
      securityCode: securityCode,
      signature: this.generateSignature(amount, trxId),
    }

    return await this.request(`${this.BASE_API}/v1.0/api/auth/customer/unlockAndValidateTrxId`, field, this.headers())
  }

  async transferOVO(amount, phoneNumber, trxId, message = "") {
    const field = {
      amount: amount,
      to: phoneNumber,
      trxId: trxId,
      message: message,
    }

    return await this.request(`${this.BASE_API}/v1.0/api/customers/transfer`, field, this.headers())
  }

  async transferBankInquiry(bankCode, bankNumber, amount, message = "") {
    const field = {
      bankCode: bankCode,
      accountNo: bankNumber,
      amount: amount,
      message: message,
    }

    return await this.request(`${this.BASE_API}/transfer/inquiry/`, field, this.headers())
  }

  async transferBankDirect(bankCode, bankNumber, bankName, bankAccountName, trxId, amount, notes = "") {
    const ovoCashCardNumber = await this.getOvoCashCardNumber()
    const field = {
      bankCode: bankCode,
      accountNo: ovoCashCardNumber,
      amount: amount,
      accountNoDestination: bankNumber,
      bankName: bankName,
      accountName: bankAccountName,
      notes: notes,
      transactionId: trxId,
    }

    return await this.request(`${this.BASE_API}/transfer/direct`, field, this.headers())
  }

  async QrisPay(amount, trxId, qrid) {
    const field = {
      qrPayload: qrid,
      locationInfo: {
        accuracy: 11.00483309472351,
        verticalAccuracy: 3,
        longitude: 84.90665207978246,
        heading: 11.704396994254495,
        latitude: -9.432921591875759,
        altitude: 84.28827400936305,
        speed: 0.11528167128562927,
      },
      deviceInfo: {
        deviceBrand: "Apple",
        deviceModel: "iPhone",
        appVersion: this.app_version,
        deviceToken: this.push_notification_id,
      },
      paymentDetail: [
        {
          amount: amount,
          id: "001",
          name: "OVO Cash",
        },
      ],
      transactionId: trxId,
      appsource: "OVO-APPS",
    }

    return await this.request(
      `${this.BASE_API}/wallet/purchase/qr?qrid=${encodeURIComponent(qrid)}`,
      field,
      this.headers(),
    )
  }

  async createDynamicQris(amount, description = "", merchantName = "", validityPeriod = 3600) {
    const field = {
      amount: amount,
      description: description,
      merchantName: merchantName,
      validityPeriod: validityPeriod,
      qrType: "DYNAMIC",
      transactionId: this.generateUUIDV4(),
      deviceInfo: {
        deviceBrand: "Apple",
        deviceModel: "iPhone",
        appVersion: this.app_version,
        deviceToken: this.push_notification_id,
      },
      locationInfo: {
        accuracy: 11.00483309472351,
        verticalAccuracy: 3,
        longitude: 84.90665207978246,
        heading: 11.704396994254495,
        latitude: -9.432921591875759,
        altitude: 84.28827400936305,
        speed: 0.11528167128562927,
      },
    }

    return await this.request(`${this.BASE_API}/wallet/qr/generate/dynamic`, field, this.headers())
  }

  async getDynamicQrisStatus(qrisId) {
    return await this.request(`${this.BASE_API}/wallet/qr/status/${qrisId}`, false, this.headers())
  }

  async cancelDynamicQris(qrisId) {
    const field = {
      qrisId: qrisId,
      reason: "USER_CANCEL",
    }

    return await this.request(`${this.BASE_API}/wallet/qr/cancel`, field, this.headers())
  }

  async getQrisHistory(page = 1, limit = 10) {
    return await this.request(`${this.BASE_API}/wallet/qr/history?page=${page}&limit=${limit}`, false, this.headers())
  }

  parse(json, asArray = true) {
    return JSON.parse(json)
  }

  async request(url, post = false, headers = false) {
    try {
      const config = {
        url: url,
        method: post ? "POST" : "GET",
        headers: headers || {},
        timeout: 30000,
      }

      if (post) {
        config.data = post
      }

      const response = await axios(config)
      return JSON.stringify(response.data)
    } catch (error) {
      throw error
    }
  }

  async requests(url, post = false, headers = false) {
    try {
      const config = {
        url: url,
        method: post ? "POST" : "GET",
        headers: headers || {},
        timeout: 30000,
      }

      if (post) {
        config.data = post
      }

      const response = await axios(config)
      return response.data
    } catch (error) {
      throw error
    }
  }

  commander_headers() {
    const headers = {
      accept: "application/json, text/plain, */*",
      "app-id": "webview-pointexpiry",
      "client-id": this.client_id,
      "accept-language": "id",
      service: "police",
      origin: "https://webview.ovo.id",
      "user-agent": this.user_agent,
      referer: "https://webview.ovo.id/pointexpiry?version=3.43.0",
    }

    if (this.auth_token) {
      headers["authorization"] = `Bearer ${this.auth_token}`
    }

    if (this.hmac_hash) {
      headers["hmac"] = this.hmac_hash
    }

    if (this.hmac_hash_random) {
      headers["random"] = this.hmac_hash_random
    }

    return headers
  }
}

module.exports = Ovo
