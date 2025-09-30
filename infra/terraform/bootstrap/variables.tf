variable "aws_region" {
  description = "The AWS region to deploy resources to"
  type        = string
  default     = "us-east-2"
}

variable "alert_email" {
  description = "E-mail address for JailData alerts"
  type        = string
}

variable "jail_data_base_url" {
  description = "Base URL for external jail data API endpoints"
  type        = string
}

variable "buncombe_api_id" {
  description = "API ID for Buncombe County jail data system"
  type        = string
}