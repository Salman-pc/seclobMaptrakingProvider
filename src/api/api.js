import axiosConfig from "../config/axiosConfig"


export const registerUserApi = async (userData)=>{
    try {
        const response = await axiosConfig.post("/v1/servicepartner/auth/login",userData)
        return response.data
    } catch (error) {
        throw error;
    }
}

export const loginUserApi = async (userData)=>{
    try {
        const response = await axiosConfig.post("/v1/servicepartner/auth/login",userData)
        return response.data
    } catch (error) {
        throw error;
    }
}

export const getCustomerAddressApi = async (userId)=>{
    try {
        const response = await axiosConfig.get(`/api/user/address/customer-location?userId=${userId}`)
        return response.data
    } catch (error) {
        throw error;
    }
}

export const userBookedServiceApi = async (id)=>{
    try {
        const params={}
        if(id) params._id=id
        const response = await axiosConfig.get("/v1/vehicleService/user-booking/list",{params})
        return response.data.data
    } catch (error) {
        throw error;
    }
}