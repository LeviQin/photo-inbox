Pod::Spec.new do |s|
  s.name = 'ExpoPhotoOcr'
  s.version = '1.3.0'
  s.summary = 'On-device text recognition for local photos'
  s.description = 'Local photo text recognition with Apple Vision.'
  s.license = 'MIT'
  s.author = 'Photo Inbox contributors'
  s.homepage = 'https://github.com/LeviQin/photo-inbox'
  s.source = { :git => 'https://github.com/LeviQin/photo-inbox.git' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Photos', 'Vision', 'ImageIO', 'UIKit'
  s.source_files = '*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
