# This file should contain all the record creation needed to seed the database with its default values.
# The data can then be loaded with the rake db:seed (or created alongside the db with db:setup).
#
# Examples:
#
#   cities = City.create([{ name: 'Chicago' }, { name: 'Copenhagen' }])
#   Mayor.create(name: 'Emanuel', city: cities.first)

user1 = User.process_new({
  name: 'Example',
  user_name: 'example',
  email: 'admin@example.com',
  public: false,
  password: 'password',
  description: "I'm just here to help",
  location: "Anywhere and everywhere"
}, { 
  is_admin: true
})
org = Organization.create(:admin => true, :settings => {:name => "Admin Organization"})
image1 = ButtonImage.process_new({
  license: {
    type: "private"
  },
  url: "http://mcswhispers.files.wordpress.com/2012/08/yellow_happy11.jpg"
}, {:user => user1, :download => false})
image2 = ButtonImage.process_new({
  license: {
    type: "private"
  },
  url: "http://misc.phillipmartin.info/misc_jump.gif"
}, {:user => user1, :download => false})
image_yes = ButtonImage.process_new({
  license: {
    type: "private"
  },
  url: "http://2.bp.blogspot.com/-qRKJklGUYQw/UKa1Y7UOkAI/AAAAAAAACKY/xtCQ760g0wA/s400/24314255.jpg"
}, {:user => user1})
image_no = ButtonImage.process_new({
  license: {
    type: "private"
  },
  url: "http://deborahjones.theworldrace.org/blogphotos/theworldrace/deborahjones/no-1.jpg"
}, {:user => user1, :download => false})
sound1 = ButtonSound.process_new({
  url: "http://www.stephaniequinn.com/Music/Commercial%20DEMO%20-%2013.mp3"
}, {:user => user1, :download => false})
board1 = Board.process_new({}, {key: 'One', user: user1})
board2 = Board.process_new({}, {key: 'Two', user: user1})
puts "===== Board Three Init ====="
board3 = Board.process_new({
  name: 'Three',
  buttons: [
    {
      id: 1,
      label: "Want",
      image_id: image1.global_id,
      load_board: {
        id: board1.global_id,
        key: board1.key
      }
    },
    {
      id: 2,
      image_id: image2.global_id,
      label: "Need"
    }
  ],
  grid: {
    rows: 1,
    columns: 2,
    order: [[1,2]]
  }
}, {user: user1})
puts "===== Board Two Init ====="
board2.reload
board2.process({
  name: 'Two',
  public: true,
  buttons: [
    {
      id: 1,
      label: "Jump",
      image_id: image1.global_id,
      load_board: {
        id: board3.global_id,
        key: board3.key
      }
    },
    {
      id: 2,
      image_id: image2.global_id,
      label: "Duck"
    }
  ],
  grid: {
    rows: 1,
    columns: 2,
    order: [[1,2]]
  }
})
puts "===== Board One Init ====="
board1.reload
board1.process({
  name: 'One',
  public: true,
  buttons: [
    {
      id: 1,
      label: "Happy",
      image_id: image1.global_id,
      load_board: {
        id: board2.global_id,
        key: board2.key
      }
    },
    {
      id: 2,
      image_id: image2.global_id,
      label: "Sad",
      border_color: "#000"
    },
    {
      id: 3,
      image_id: image2.global_id,
      label: "Glad",
      border_color: "#0aa"
    },
    {
      id: 4,
      image_id: image2.global_id,
      label: "Bad",
      background_color: "#faa"
    },
    {
      id: 5,
      image_id: image2.global_id,
      label: "Mad"
    },
    {
      id: 6,
      image_id: image2.global_id,
      label: "Rad",
      sound_id: sound1.global_id
    }
  ],
  grid: {
    rows: 2,
    columns: 4,
    order: [[1,2,3,4],[0,5,9,6]]
  }
})
puts "===== Board Yes/No Init ====="
board_yesno = Board.process_new({
  name: 'Simple Yes/No',
  public: true,
  buttons: [
    {
      id: 1,
      label: "Yes",
      image_id: image_yes.global_id,
    },
    {
      id: 2,
      image_id: image_no.global_id,
      label: "No",
    }
  ],
  grid: {
    rows: 1,
    columns: 2,
    order: [[1,2]]
  }
}, {user: user1, key: "yesno"})

# Ensure initial boards show up on the homepage by starring a few
user1.reload
user1.settings['starred_board_ids'] ||= []
user1.settings['starred_board_ids'] = (user1.settings['starred_board_ids'] + [board1.global_id, board2.global_id, board_yesno.global_id]).uniq
user1.save

lat = 35.674831
long = -108.0297416
u = user1
d = Device.create(:user => u)
ts = Time.now.to_i - 100
s1 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'ok', 'board' => {'id' => board1.global_id}}, 'geo' => [lat, long], 'timestamp' => ts}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
s2 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'go', 'board' => {'id' => board1.global_id}}, 'geo' => [lat + 0.0001, long + 0.0001], 'timestamp' => ts + 2}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
s3 = LogSession.process_new({'events' => [{'type' => 'utterance', 'utterance' => {'text' => 'ok go', 'buttons' => []}, 'geo' => [lat, long], 'timestamp' => ts + 3}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
s4 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'I', 'board' => {'id' => board1.global_id}}, 'geo' => [lat, long], 'timestamp' => ts + 5}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
s5 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'want', 'board' => {'id' => board1.global_id}}, 'geo' => [lat + 0.0001, long - 0.0001], 'timestamp' => ts + 7}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
s6 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'more', 'board' => {'id' => board1.global_id}}, 'geo' => [lat, long], 'timestamp' => ts + 9}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.6'})
s7 = LogSession.process_new({'events' => [{'type' => 'utterance', 'utterance' => {'text' => 'I want more', 'buttons' => []}, 'geo' => [lat + 0.0001, long + 0.0001], 'timestamp' => ts + 15}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
s8 = LogSession.process_new({'events' => [{'type' => 'utterance', 'utterance' => {'text' => 'I want more', 'buttons' => []}, 'geo' => [lat, long], 'timestamp' => ts + 19}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
s9 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'never', 'board' => {'id' => board1.global_id}}, 'geo' => [lat + 0.0001, long - 0.0001], 'timestamp' => ts + 20}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.6'})
s10 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'ice cream', 'board' => {'id' => board1.global_id}}, 'geo' => [lat + 2, long], 'timestamp' => ts + 21}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.6'})
s11 = LogSession.process_new({'events' => [{'type' => 'utterance', 'utterance' => {'text' => 'never ice cream', 'buttons' => []}, 'geo' => [lat + 2.0001, long + 0.0001], 'timestamp' => ts + 23}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.6'})
s12 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'candy bar', 'board' => {'id' => board1.global_id}}, 'geo' => [lat + 2.0001, long + 0.0001], 'timestamp' => ts + 24}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.6'})
s13 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'for me', 'board' => {'id' => board1.global_id}}, 'geo' => [lat + 2.0001, long - 0.0001], 'timestamp' => ts + 25}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.6'})
s14 = LogSession.process_new({'events' => [{'type' => 'utterance', 'utterance' => {'text' => 'candy bar for me', 'buttons' => []}, 'geo' => [lat + 2, long], 'timestamp' => ts + 27}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.6'})
s15 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'please', 'board' => {'id' => board1.global_id}}, 'geo' => [lat, long], 'timestamp' => ts + 30}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
s16 = LogSession.process_new({'events' => [{'type' => 'utterance', 'utterance' => {'text' => 'candy bar for me please', 'buttons' => []}, 'geo' => [lat + 0.0001, long + 0.0001], 'timestamp' => ts + 35}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
s17 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'this', 'board' => {'id' => board1.global_id}}, 'geo' => [lat + 0.0001, long], 'timestamp' => ts + 45}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
s18 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'is', 'board' => {'id' => board1.global_id}}, 'geo' => [lat - 0.0001, long], 'timestamp' => ts + 55}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
s19 = LogSession.process_new({'events' => [{'type' => 'button', 'button' => {'label' => 'fun', 'board' => {'id' => board1.global_id}}, 'geo' => [lat - 0.0001, long - 0.0001], 'timestamp' => ts + 59}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
s20 = LogSession.process_new({'events' => [{'type' => 'utterance', 'utterance' => {'text' => 'this is fun', 'buttons' => []}, 'geo' => [lat, long], 'timestamp' => ts + 60}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})
s21 = LogSession.process_new({'events' => [{'type' => 'utterance', 'utterance' => {'text' => 'this is fun', 'buttons' => []}, 'geo' => [lat + 0.0001, long], 'timestamp' => ts + 61}]}, {:user => u, :author => u, :device => d, :ip_address => '1.2.3.4'})

puts "==== Addings Parts-of-Speech Data ===="
MobyParser.import_words
WordData.import_suggestions

#     LingoLinq.Board.FIXTURES = [
#       {
#         format: "open-board-0.1",
#         id: 1,
#         name: 'One',
#         image_url: "image",
#         buttons: [
#           {
#             id: 1,
#             label: "Happy",
#             image_id: 1,
#             load_board: {
#               board_id: 2
#             }
#           },
#           {
#             id: 2,
#             image_id: 2,
#             label: "Sad",
#             border_color: "#000"
#           },
#           {
#             id: 3,
#             image_id: 2,
#             label: "Glad",
#             border_color: "#0aa"
#           },
#           {
#             id: 4,
#             image_id: 2,
#             label: "Bad",
#             background_color: "#faa"
#           },
#           {
#             id: 5,
#             image_id: 2,
#             label: "Mad"
#           },
#           {
#             id: 6,
#             image_id: 2,
#             label: "Rad"
#           }
#         ],
#         grid: Ember.Object.create({
#           rows: 2,
#           columns: 4,
#           order: [[1,2,3,4],[0,5,9,6]]
#         }),
#         images: [
#           {
#             id: 1,
#             url: "http://mcswhispers.files.wordpress.com/2012/08/yellow_happy11.jpg"
#           },
#           {
#             id: 2,
#             url: "http://misc.phillipmartin.info/misc_jump.gif"
#           }
#         ]
#       },
#       {
#         id: 2,
#         name: 'Two',
#         imageUrl: "",
#         buttons: [
#           {
#             id: 1,
#             label: "Jump",
#             image_id: 1,
#             load_board: {
#               board_id: 3
#             }
#           },
#           {
#             id: 2,
#             image_id: 2,
#             label: "Duck"
#           }
#         ],
#         grid: Ember.Object.create({
#           rows: 1,
#           columns: 2,
#           order: [[1,2]]
#         }),
#         images: [
#           {
#             id: 1,
#             url: "http://mcswhispers.files.wordpress.com/2012/08/yellow_happy11.jpg"
#           },
#           {
#             id: 2,
#             url: "http://misc.phillipmartin.info/misc_jump.gif"
#           }
#         ]
#       },
#       {
#         id: 3,
#         name: 'Three',
#         imageUrl: "",
#         buttons: [
#           {
#             id: 1,
#             label: "Want",
#             image_id: 1,
#             load_board: {
#               board_id: 1
#             }
#           },
#           {
#             id: 2,
#             image_id: 2,
#             label: "Need"
#           }
#         ],
#         grid: Ember.Object.create({
#           rows: 1,
#           columns: 2,
#           order: [[1,2]]
#         }),
#         images: [
#           {
#             id: 1,
#             url: "http://mcswhispers.files.wordpress.com/2012/08/yellow_happy11.jpg"
#           },
#           {
#             id: 2,
#             url: "http://misc.phillipmartin.info/misc_jump.gif"
#           }
#         ]
#       }
#     ];
