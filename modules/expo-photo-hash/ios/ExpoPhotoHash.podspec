Pod::Spec.new do |s|
  s.name = 'ExpoPhotoHash'
  s.version = '1.3.0'
  s.summary = 'Local photo visual analysis'
  s.description = 'Local visual hashing and size analysis for photos.'
  s.license = 'MIT'
  s.author = 'Photo Inbox contributors'
  s.homepage = 'https://github.com/LeviQin/photo-inbox'
  s.source = { :git => 'https://github.com/LeviQin/photo-inbox.git' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Photos', 'UIKit', 'CryptoKit'
  s.source_files = '*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
